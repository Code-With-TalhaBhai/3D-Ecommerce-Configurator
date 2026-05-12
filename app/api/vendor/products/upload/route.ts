import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { processGlb } from "@/lib/glb/process";
import { MAX_GLB_BYTES } from "@/lib/glb/limits";

export const runtime = "nodejs";
// 50 MB GLB + form fields; keep ample headroom.
export const maxDuration = 60;

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);

const fieldsSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(10).max(5000),
  price: z.coerce.number().nonnegative().max(1_000_000),
  stock: z.coerce.number().int().min(0).max(100_000),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "VENDOR" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  // Generate a unique slug so two vendors can pick the same title.
  const baseSlug = slugify(fieldsResult.data.title) || "product";
  let slug = baseSlug;
  for (let i = 1; await prisma.product.findUnique({ where: { slug } }); i++) {
    slug = `${baseSlug}-${i}`;
  }

  const key = `vendors/${vendor.id}/products/${slug}-${Date.now()}.glb`;

  let url: string;
  try {
    const result = await storage.upload({
      key,
      body: Buffer.from(processed.compressed),
      contentType: "model/gltf-binary",
    });
    url = result.url;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Storage upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      title: fieldsResult.data.title,
      slug,
      description: fieldsResult.data.description,
      price: fieldsResult.data.price,
      stock: fieldsResult.data.stock,
      glbUrl: url,
      polyCount: processed.stats.triangles,
      fileSize: processed.stats.compressedBytes,
      // status defaults to PENDING per schema; awaits admin review (AGENTS §3.7).
    },
    select: { id: true, slug: true, status: true },
  });

  return NextResponse.json({
    product,
    stats: processed.stats,
  });
}
