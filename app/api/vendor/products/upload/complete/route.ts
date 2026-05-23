import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { processGlb } from "@/lib/glb/process";
import {
  ACCEPTED_TEXTURE_MIME,
  MAX_GLB_BYTES,
  MAX_TEXTURE_BYTES,
  MAX_VARIANTS,
} from "@/lib/glb/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);

const variantSchema = z.object({
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex (e.g. #ff8800)")
    .optional(),
  material: z.string().max(60).optional(),
  textureKey: z.string().max(300).optional(),
});

const completeSchema = z.object({
  uploadId: z.string().uuid(),
  title: z.string().min(2).max(120),
  description: z.string().min(10).max(5000),
  price: z.coerce.number().nonnegative().max(1_000_000),
  stock: z.coerce.number().int().min(0).max(100_000),
  glbKey: z.string().min(1).max(300),
  variants: z.array(variantSchema).max(MAX_VARIANTS).optional().default([]),
});

/**
 * Step 2 of the two-step vendor upload flow. By this point the browser has
 * PUT the raw GLB (and any variant textures) directly to S3 via presigned
 * URLs from `/init`. We fetch the GLB server-to-server, run Draco
 * compression, write the compressed copy to its permanent key, delete the
 * pending raw object, and create the Product + ProductVariant rows. Server
 * fetches don't go through Vercel's serverless request-body cap, so a 100 MB
 * raw GLB is fine.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "VENDOR" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!session.user.id) {
      return NextResponse.json(
        { error: "Session is missing user id. Please log out and sign in again." },
        { status: 401 },
      );
    }

    const vendor = await prisma.vendor.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!vendor) {
      return NextResponse.json(
        { error: "Set up your storefront first." },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid fields",
          fieldErrors: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // Every key must live under this vendor's namespace and carry the upload id
    // — prevents a vendor from referencing another vendor's pending uploads.
    const glbPrefix = `pending/${vendor.id}/${data.uploadId}`;
    const texturePrefix = `vendors/${vendor.id}/textures/${data.uploadId}-`;
    if (!data.glbKey.startsWith(glbPrefix)) {
      return NextResponse.json({ error: "glbKey does not match this upload." }, { status: 400 });
    }
    for (const v of data.variants) {
      if (v.textureKey && !v.textureKey.startsWith(texturePrefix)) {
        return NextResponse.json(
          { error: "Variant textureKey does not match this upload." },
          { status: 400 },
        );
      }
    }

    // HEAD the GLB the browser claimed to upload. Validates size + presence
    // before we burn CPU on Draco compression.
    const glbHead = await storage.headObject(data.glbKey);
    if (!glbHead) {
      return NextResponse.json({ error: "GLB was not uploaded." }, { status: 400 });
    }
    if (glbHead.contentLength === 0) {
      return NextResponse.json({ error: "Uploaded GLB is empty." }, { status: 400 });
    }
    if (glbHead.contentLength > MAX_GLB_BYTES) {
      return NextResponse.json(
        { error: `GLB exceeds the ${Math.round(MAX_GLB_BYTES / 1024 / 1024)} MB limit.` },
        { status: 413 },
      );
    }

    // Re-validate every texture the same way.
    const textureHeads = new Map<string, { contentLength: number; contentType?: string }>();
    for (const v of data.variants) {
      if (!v.textureKey) continue;
      if (textureHeads.has(v.textureKey)) continue;
      const head = await storage.headObject(v.textureKey);
      if (!head) {
        return NextResponse.json(
          { error: `Texture ${v.textureKey} was not uploaded.` },
          { status: 400 },
        );
      }
      if (head.contentLength === 0) {
        return NextResponse.json(
          { error: `Texture ${v.textureKey} is empty.` },
          { status: 400 },
        );
      }
      if (head.contentLength > MAX_TEXTURE_BYTES) {
        return NextResponse.json(
          { error: `Texture ${v.textureKey} exceeds 2 MB.` },
          { status: 413 },
        );
      }
      if (head.contentType && !ACCEPTED_TEXTURE_MIME.has(head.contentType)) {
        return NextResponse.json(
          { error: `Texture ${v.textureKey} must be JPEG, PNG, or WebP.` },
          { status: 400 },
        );
      }
      textureHeads.set(v.textureKey, head);
    }

    let bytes: Uint8Array;
    try {
      bytes = await storage.getObjectBytes(data.glbKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to read GLB from storage.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const processed = await processGlb(bytes);
    if (!processed.ok) {
      // Clean up the raw upload so we don't accumulate orphans.
      await storage.remove(data.glbKey);
      return NextResponse.json({ error: processed.reason }, { status: 400 });
    }

    // Slug uniqueness so two vendors can pick the same title.
    const baseSlug = slugify(data.title) || "product";
    let slug = baseSlug;
    for (let i = 1; await prisma.product.findUnique({ where: { slug } }); i++) {
      slug = `${baseSlug}-${i}`;
    }

    const finalGlbKey = `vendors/${vendor.id}/products/${slug}-${Date.now()}.glb`;
    let glbUrl: string;
    try {
      const result = await storage.upload({
        key: finalGlbKey,
        body: Buffer.from(processed.compressed),
        contentType: "model/gltf-binary",
      });
      glbUrl = result.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Storage upload failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Drop the raw pending object once the compressed copy is durable.
    await storage.remove(data.glbKey);

    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        title: data.title,
        slug,
        description: data.description,
        price: data.price,
        stock: data.stock,
        glbUrl,
        polyCount: processed.stats.triangles,
        fileSize: processed.stats.compressedBytes,
        // status defaults to PENDING per schema; awaits admin review (AGENTS §3.7).
        variants: {
          create: data.variants.map((v) => ({
            color: v.color ?? null,
            material: v.material ?? null,
            textureUrl: v.textureKey ? storage.publicUrl(v.textureKey) : null,
          })),
        },
      },
      select: { id: true, slug: true, status: true },
    });

    return NextResponse.json({
      product,
      stats: processed.stats,
    });
  } catch (err) {
    console.error("[/api/vendor/products/upload/complete] unhandled error:", err);
    const msg = err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json(
      { error: `Upload failed: ${msg}` },
      { status: 500 },
    );
  }
}
