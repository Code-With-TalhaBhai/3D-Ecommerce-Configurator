import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

// Hard ceiling on a single chunk request. Just below Vercel's 4.5 MB inbound
// cap; the init route hands the client a smaller chunk size so we never hit
// this — this is the defensive backstop.
const MAX_CHUNK_BYTES = Math.floor(4.4 * 1024 * 1024);
// Total chunks the init route can hand out is bounded by MAX_GLB_BYTES / 4 MB,
// well under this.
const MAX_PART_INDEX = 999;

const querySchema = z.object({
  uploadId: z.string().uuid(),
  part: z.coerce.number().int().min(0).max(MAX_PART_INDEX),
});

function partKey(vendorId: string, uploadId: string, part: number) {
  // Zero-padded so a lexicographic listing of the prefix is the natural order.
  return `pending/${vendorId}/${uploadId}/chunk-${String(part).padStart(4, "0")}.bin`;
}

/**
 * Step 2: receive one chunk of the raw GLB and persist it to S3 as a temp
 * object. Each chunk is bounded so the request fits under Vercel's per-call
 * request-body cap. The /complete route reassembles all chunks server-to-S3.
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
      part: url.searchParams.get("part"),
    });
    if (!queryResult.success) {
      return NextResponse.json(
        { error: "Missing or invalid uploadId/part query params." },
        { status: 400 },
      );
    }

    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: "Empty chunk." }, { status: 400 });
    }
    if (buf.byteLength > MAX_CHUNK_BYTES) {
      return NextResponse.json(
        { error: `Chunk exceeds the ${MAX_CHUNK_BYTES} byte cap.` },
        { status: 413 },
      );
    }

    await storage.upload({
      key: partKey(vendor.id, queryResult.data.uploadId, queryResult.data.part),
      body: Buffer.from(buf),
      contentType: "application/octet-stream",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/vendor/products/upload/chunk] unhandled error:", err);
    const msg = err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json(
      { error: `Chunk upload failed: ${msg}` },
      { status: 500 },
    );
  }
}
