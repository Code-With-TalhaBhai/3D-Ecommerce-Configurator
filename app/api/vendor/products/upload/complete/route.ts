import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { processGlb } from "@/lib/glb/process";
import { resolveCategoryId } from "@/lib/categories";
import {
  ACCEPTED_TEXTURE_MIME,
  MAX_GLB_BYTES,
  MAX_TEXTURE_BYTES,
  MAX_VARIANTS,
} from "@/lib/glb/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHUNKS = 1000;

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
  totalChunks: z.number().int().positive().max(MAX_CHUNKS),
  title: z.string().min(2).max(120),
  description: z.string().min(10).max(5000),
  price: z.coerce.number().nonnegative().max(1_000_000),
  stock: z.coerce.number().int().min(0).max(100_000),
  categoryId: z.string().max(60).optional(),
  variants: z.array(variantSchema).max(MAX_VARIANTS).optional().default([]),
  thumbnailKey: z.string().max(300).optional(),
});

function partKey(vendorId: string, uploadId: string, part: number) {
  return `pending/${vendorId}/${uploadId}/chunk-${String(part).padStart(4, "0")}.bin`;
}

/**
 * Final step of the chunked upload flow. Pulls every temp chunk back from S3
 * (server → S3, no payload cap), concatenates them into the original GLB,
 * runs Draco compression, writes the compressed copy to its permanent key,
 * and creates the Product + ProductVariant rows.
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
      select: { id: true, approvedAt: true },
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

    // Texture keys are written by the /texture route under this exact prefix.
    // Refuse anything else so a malicious request can't reference another
    // vendor's textures by key.
    const texturePrefix = `vendors/${vendor.id}/textures/${data.uploadId}-`;
    for (const v of data.variants) {
      if (v.textureKey && !v.textureKey.startsWith(texturePrefix)) {
        return NextResponse.json(
          { error: "Variant textureKey does not match this upload." },
          { status: 400 },
        );
      }
    }

    // Thumbnail key is written by the /thumbnail route at this exact path.
    // Pin both the upload id and the .png suffix so a request can't reference
    // a sibling upload's thumbnail or an unrelated S3 key.
    const expectedThumbnailKey = `vendors/${vendor.id}/thumbnails/${data.uploadId}.png`;
    if (data.thumbnailKey && data.thumbnailKey !== expectedThumbnailKey) {
      return NextResponse.json(
        { error: "thumbnailKey does not match this upload." },
        { status: 400 },
      );
    }

    // Re-validate every texture before we burn CPU on Draco.
    for (const v of data.variants) {
      if (!v.textureKey) continue;
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
          { error: `Texture ${v.textureKey} exceeds the size limit.` },
          { status: 413 },
        );
      }
      if (head.contentType && !ACCEPTED_TEXTURE_MIME.has(head.contentType)) {
        return NextResponse.json(
          { error: `Texture ${v.textureKey} has an unsupported content type.` },
          { status: 400 },
        );
      }
    }

    // Pull every chunk back in parallel. Each GET is server-to-server with no
    // payload cap, so the only ceiling is total memory while the buffers are
    // held — bounded by MAX_GLB_BYTES (100 MB).
    let chunks: Uint8Array[];
    try {
      chunks = await Promise.all(
        Array.from({ length: data.totalChunks }, (_, i) =>
          storage.getObjectBytes(partKey(vendor.id, data.uploadId, i)),
        ),
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to read chunks from storage.";
      return NextResponse.json(
        { error: `Could not reassemble upload: ${msg}` },
        { status: 500 },
      );
    }

    const totalSize = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    if (totalSize === 0) {
      return NextResponse.json({ error: "Uploaded GLB is empty." }, { status: 400 });
    }
    if (totalSize > MAX_GLB_BYTES) {
      return NextResponse.json(
        {
          error: `Assembled GLB (${(totalSize / 1024 / 1024).toFixed(1)} MB) exceeds the ${Math.round(MAX_GLB_BYTES / 1024 / 1024)} MB limit.`,
        },
        { status: 413 },
      );
    }

    // Concatenate into a single buffer for processGlb.
    const assembled = new Uint8Array(totalSize);
    let offset = 0;
    for (const c of chunks) {
      assembled.set(c, offset);
      offset += c.byteLength;
    }
    // Drop references early so the GC can reclaim the per-chunk buffers while
    // Draco is running.
    chunks = [];

    const processed = await processGlb(assembled);
    if (!processed.ok) {
      // Best-effort: clear the temp chunks so we don't accumulate orphans on
      // rejected uploads.
      await Promise.all(
        Array.from({ length: data.totalChunks }, (_, i) =>
          storage.remove(partKey(vendor.id, data.uploadId, i)),
        ),
      );
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

    // Drop the temp chunks once the compressed copy is durable.
    await Promise.all(
      Array.from({ length: data.totalChunks }, (_, i) =>
        storage.remove(partKey(vendor.id, data.uploadId, i)),
      ),
    );

    // Vendor approval is the trust gate. Once admin has approved the store,
    // their uploads go live immediately; otherwise the product still queues
    // for review. Admins can always revoke an approved product later from
    // /admin/products (Approved tab → Revoke).
    const autoApprove = vendor.approvedAt !== null;

    const thumbnailUrl = data.thumbnailKey
      ? storage.publicUrl(data.thumbnailKey)
      : null;

    // Validate the selected category, defaulting to "Others" when absent or
    // stale (e.g. the category was deleted between page load and submit).
    const categoryId = await resolveCategoryId(data.categoryId);

    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId,
        title: data.title,
        slug,
        description: data.description,
        price: data.price,
        stock: data.stock,
        glbUrl,
        thumbnailUrl,
        polyCount: processed.stats.triangles,
        fileSize: processed.stats.compressedBytes,
        status: autoApprove ? "APPROVED" : "PENDING",
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
