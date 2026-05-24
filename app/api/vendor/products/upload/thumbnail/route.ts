import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { MAX_THUMBNAIL_BYTES } from "@/lib/glb/limits";

export const runtime = "nodejs";
export const maxDuration = 30;

const querySchema = z.object({
  uploadId: z.string().uuid(),
});

/**
 * Receive a 2D PNG thumbnail captured client-side from the live R3F preview
 * and persist it to its permanent S3 key. Same-origin (browser → Next.js
 * function → S3), so the bucket needs no CORS rule for the thumbnail path.
 *
 * Why we generate the thumbnail at upload time, not lazily on the listings
 * page: rendering every product card with a hidden R3F canvas was making
 * /products spend ~200–400 ms per card initializing WebGL and parsing the
 * GLB, even with `frameloop="demand"`. Capturing a single PNG at upload
 * time lets every listing surface (/products, /vendor/products, cart,
 * checkout) drop to a plain `<img>` — no Three.js on the critical path.
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
    });
    if (!queryResult.success) {
      return NextResponse.json(
        { error: "Missing or invalid uploadId query param." },
        { status: 400 },
      );
    }

    // Client-captured thumbs are always PNG (canvas.toDataURL("image/png")).
    // Lock the contentType down so we don't accept a JPEG masquerading as a
    // thumbnail.
    const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim();
    if (contentType !== "image/png") {
      return NextResponse.json(
        { error: "Thumbnail must be PNG." },
        { status: 400 },
      );
    }

    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: "Empty thumbnail." }, { status: 400 });
    }
    if (buf.byteLength > MAX_THUMBNAIL_BYTES) {
      return NextResponse.json(
        {
          error: `Thumbnail exceeds the ${Math.round(
            MAX_THUMBNAIL_BYTES / 1024 / 1024,
          )} MB limit.`,
        },
        { status: 413 },
      );
    }

    const key = `vendors/${vendor.id}/thumbnails/${queryResult.data.uploadId}.png`;
    await storage.upload({
      key,
      body: Buffer.from(buf),
      contentType: "image/png",
    });

    return NextResponse.json({ ok: true, key });
  } catch (err) {
    console.error("[/api/vendor/products/upload/thumbnail] unhandled error:", err);
    const msg = err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json(
      { error: `Thumbnail upload failed: ${msg}` },
      { status: 500 },
    );
  }
}
