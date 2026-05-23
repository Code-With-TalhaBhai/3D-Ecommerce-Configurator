import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import {
  ACCEPTED_TEXTURE_MIME,
  MAX_TEXTURE_BYTES,
  MAX_VARIANTS,
} from "@/lib/glb/limits";

export const runtime = "nodejs";
export const maxDuration = 30;

const querySchema = z.object({
  uploadId: z.string().uuid(),
  index: z.coerce.number().int().min(0).max(MAX_VARIANTS - 1),
});

function textureExt(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/**
 * Receive a single variant texture and persist it to its permanent S3 key.
 * Same-origin (browser → Next.js function → S3) so no S3 CORS surface.
 * Textures are always under MAX_TEXTURE_BYTES (2 MB), comfortably under
 * Vercel's request-body cap, so they don't need chunking like the GLB does.
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

    const url = new URL(req.url);
    const queryResult = querySchema.safeParse({
      uploadId: url.searchParams.get("uploadId"),
      index: url.searchParams.get("index"),
    });
    if (!queryResult.success) {
      return NextResponse.json(
        { error: "Missing or invalid uploadId/index query params." },
        { status: 400 },
      );
    }

    const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ACCEPTED_TEXTURE_MIME.has(contentType)) {
      return NextResponse.json(
        { error: "Texture must be JPEG, PNG, or WebP." },
        { status: 400 },
      );
    }

    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: "Empty texture." }, { status: 400 });
    }
    if (buf.byteLength > MAX_TEXTURE_BYTES) {
      return NextResponse.json(
        { error: `Texture exceeds the ${Math.round(MAX_TEXTURE_BYTES / 1024 / 1024)} MB limit.` },
        { status: 413 },
      );
    }

    const ext = textureExt(contentType);
    const key = `vendors/${vendor.id}/textures/${queryResult.data.uploadId}-${queryResult.data.index}.${ext}`;

    await storage.upload({
      key,
      body: Buffer.from(buf),
      contentType,
    });

    return NextResponse.json({ ok: true, key });
  } catch (err) {
    console.error("[/api/vendor/products/upload/texture] unhandled error:", err);
    const msg = err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json(
      { error: `Texture upload failed: ${msg}` },
      { status: 500 },
    );
  }
}
