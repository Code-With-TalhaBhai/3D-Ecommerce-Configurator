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
// 50 MB GLB + up to 8 textures @ 2 MB; keep ample headroom.
export const maxDuration = 60;

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);

const fieldsSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(10).max(5000),
  price: z.coerce.number().nonnegative().max(1_000_000),
  stock: z.coerce.number().int().min(0).max(100_000),
});

const variantSchema = z.object({
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex (e.g. #ff8800)")
    .optional(),
  material: z.string().max(60).optional(),
  // textureKey points at the form field name where the texture file lives ("texture_0", "texture_1", ...).
  textureKey: z.string().regex(/^texture_\d+$/).optional(),
});

const variantsSchema = z.array(variantSchema).max(MAX_VARIANTS);

function textureExt(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

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
  });
  if (!vendor) {
    return NextResponse.json(
      { error: "Set up your storefront first." },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart payload." }, { status: 400 });
  }

  const fieldsResult = fieldsSchema.safeParse({
    title: form.get("title"),
    description: form.get("description"),
    price: form.get("price"),
    stock: form.get("stock"),
  });
  if (!fieldsResult.success) {
    return NextResponse.json(
      { error: "Invalid fields", fieldErrors: z.flattenError(fieldsResult.error).fieldErrors },
      { status: 400 },
    );
  }

  // Parse optional variants metadata.
  const variantsRaw = form.get("variants");
  let variants: z.infer<typeof variantsSchema> = [];
  if (typeof variantsRaw === "string" && variantsRaw.length > 0) {
    try {
      variants = variantsSchema.parse(JSON.parse(variantsRaw));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid variants payload";
      return NextResponse.json({ error: `Invalid variants: ${msg}` }, { status: 400 });
    }
  }

  // Validate every referenced texture file before we touch storage.
  const textureUploads: { key: string; file: File }[] = [];
  for (const v of variants) {
    if (!v.textureKey) continue;
    const f = form.get(v.textureKey);
    if (!(f instanceof File)) {
      return NextResponse.json(
        { error: `Missing texture file for variant key ${v.textureKey}` },
        { status: 400 },
      );
    }
    if (f.size === 0) {
      return NextResponse.json({ error: `Texture ${v.textureKey} is empty.` }, { status: 400 });
    }
    if (f.size > MAX_TEXTURE_BYTES) {
      return NextResponse.json(
        { error: `Texture ${v.textureKey} exceeds 2 MB.` },
        { status: 413 },
      );
    }
    if (!ACCEPTED_TEXTURE_MIME.has(f.type)) {
      return NextResponse.json(
        { error: `Texture ${v.textureKey} must be JPEG, PNG, or WebP.` },
        { status: 400 },
      );
    }
    textureUploads.push({ key: v.textureKey, file: f });
  }

  const file = form.get("glb");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "GLB file is required." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_GLB_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${Math.round(MAX_GLB_BYTES / 1024 / 1024)} MB limit.` },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const processed = await processGlb(bytes);
  if (!processed.ok) {
    return NextResponse.json({ error: processed.reason }, { status: 400 });
  }

  // Slug uniqueness so two vendors can pick the same title.
  const baseSlug = slugify(fieldsResult.data.title) || "product";
  let slug = baseSlug;
  for (let i = 1; await prisma.product.findUnique({ where: { slug } }); i++) {
    slug = `${baseSlug}-${i}`;
  }

  const glbKey = `vendors/${vendor.id}/products/${slug}-${Date.now()}.glb`;

  let glbUrl: string;
  try {
    const result = await storage.upload({
      key: glbKey,
      body: Buffer.from(processed.compressed),
      contentType: "model/gltf-binary",
    });
    glbUrl = result.url;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Storage upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Upload textures, mapping each variant.textureKey to its uploaded URL.
  const textureUrlByKey = new Map<string, string>();
  for (const tu of textureUploads) {
    const ext = textureExt(tu.file.type);
    const key = `vendors/${vendor.id}/textures/${slug}-${tu.key}-${Date.now()}.${ext}`;
    try {
      const { url } = await storage.upload({
        key,
        body: Buffer.from(await tu.file.arrayBuffer()),
        contentType: tu.file.type,
      });
      textureUrlByKey.set(tu.key, url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Storage upload failed";
      return NextResponse.json({ error: `Texture upload failed: ${msg}` }, { status: 500 });
    }
  }

  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      title: fieldsResult.data.title,
      slug,
      description: fieldsResult.data.description,
      price: fieldsResult.data.price,
      stock: fieldsResult.data.stock,
      glbUrl,
      polyCount: processed.stats.triangles,
      fileSize: processed.stats.compressedBytes,
      // status defaults to PENDING per schema; awaits admin review (AGENTS §3.7).
      variants: {
        create: variants.map((v) => ({
          color: v.color ?? null,
          material: v.material ?? null,
          textureUrl: v.textureKey ? (textureUrlByKey.get(v.textureKey) ?? null) : null,
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
    console.error("[/api/vendor/products/upload] unhandled error:", err);
    const msg = err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json(
      { error: `Upload failed: ${msg}` },
      { status: 500 },
    );
  }
}
