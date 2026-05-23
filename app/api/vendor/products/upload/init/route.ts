import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import {
  ACCEPTED_TEXTURE_MIME,
  MAX_GLB_BYTES,
  MAX_TEXTURE_BYTES,
  MAX_VARIANTS,
} from "@/lib/glb/limits";

export const runtime = "nodejs";
export const maxDuration = 30;

const initSchema = z.object({
  glb: z.object({
    size: z.number().int().positive().max(MAX_GLB_BYTES),
    contentType: z.string().min(1).max(120),
  }),
  textures: z
    .array(
      z.object({
        index: z.number().int().min(0).max(MAX_VARIANTS - 1),
        size: z.number().int().positive().max(MAX_TEXTURE_BYTES),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      }),
    )
    .max(MAX_VARIANTS)
    .optional()
    .default([]),
});

function textureExt(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/**
 * Step 1 of the two-step vendor upload flow. The browser cannot POST a 100 MB
 * GLB through a Vercel function (4.5 MB Hobby / 50 MB Pro request-body cap),
 * so we hand the browser short-lived presigned PUT URLs and let it upload
 * directly to S3. `/api/vendor/products/upload/complete` then fetches the
 * raw object server-to-server, compresses it, and persists the Product row.
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

    const parsed = initSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid init payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (!ACCEPTED_TEXTURE_MIME.size) {
      // Defensive: limits.ts always populates this set.
      return NextResponse.json({ error: "Texture MIME allowlist missing." }, { status: 500 });
    }

    const uploadId = randomUUID();
    const glbKey = `pending/${vendor.id}/${uploadId}.glb`;
    const glbPresign = await storage.presignPut({
      key: glbKey,
      contentType: parsed.data.glb.contentType,
    });

    const textures = await Promise.all(
      parsed.data.textures.map(async (t) => {
        const ext = textureExt(t.contentType);
        const key = `vendors/${vendor.id}/textures/${uploadId}-${t.index}.${ext}`;
        const { uploadUrl } = await storage.presignPut({
          key,
          contentType: t.contentType,
        });
        return { index: t.index, key, uploadUrl };
      }),
    );

    return NextResponse.json({
      uploadId,
      glb: { key: glbKey, uploadUrl: glbPresign.uploadUrl },
      textures,
    });
  } catch (err) {
    console.error("[/api/vendor/products/upload/init] unhandled error:", err);
    const msg = err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json(
      { error: `Upload init failed: ${msg}` },
      { status: 500 },
    );
  }
}
