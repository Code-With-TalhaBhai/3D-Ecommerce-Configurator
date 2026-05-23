import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ACCEPTED_TEXTURE_MIME,
  MAX_GLB_BYTES,
  MAX_TEXTURE_BYTES,
  MAX_VARIANTS,
} from "@/lib/glb/limits";

export const runtime = "nodejs";
export const maxDuration = 30;

// 4 MB per chunk: below Vercel's 4.5 MB inbound request cap on every plan tier,
// with enough headroom for HTTP framing. 100 MB GLB → 25 chunks.
const CHUNK_SIZE = 4 * 1024 * 1024;

const initSchema = z.object({
  fileSize: z.number().int().positive().max(MAX_GLB_BYTES),
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

/**
 * Step 1 of the same-origin chunked upload flow. Issues an upload id and tells
 * the client how to slice the GLB. No presigned URLs, no browser → S3 calls —
 * every byte flows through our own API routes, sidestepping S3 CORS entirely.
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

    // Sanity guard on the texture allowlist constant.
    if (!ACCEPTED_TEXTURE_MIME.size) {
      return NextResponse.json({ error: "Texture MIME allowlist missing." }, { status: 500 });
    }

    const uploadId = randomUUID();
    const totalChunks = Math.ceil(parsed.data.fileSize / CHUNK_SIZE);

    return NextResponse.json({
      uploadId,
      chunkSize: CHUNK_SIZE,
      totalChunks,
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
