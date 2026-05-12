import { NextResponse } from "next/server";

import { storage } from "@/lib/storage";

export const runtime = "nodejs";
// GLB models can be large; allow ample time for the upstream stream.
export const maxDuration = 60;

/**
 * Same-origin asset proxy.
 *
 * The browser fetches `/api/assets/<key>` (same origin, no CORS), and we
 * stream the upstream object from CloudFront / S3 server-to-server. This
 * sidesteps the cross-origin contract entirely — useful while CloudFront's
 * own CORS policy is unattached (see Issue 10 in specs/issues-list.md).
 *
 * Trade-off: every asset byte flows through the Next.js server instead of
 * straight from the CDN to the user, so this should be retired once
 * CloudFront serves CORS headers directly.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: keyParts } = await params;
  if (!keyParts?.length) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  // S3 keys can contain `/`; the catch-all route splits them — rejoin and re-encode each segment.
  const key = keyParts.map((s) => decodeURIComponent(s)).join("/");
  const upstreamUrl = storage.publicUrl(key);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { cache: "no-store" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream fetch failed";
    return NextResponse.json({ error: `Asset fetch failed: ${msg}` }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Asset not available (${upstream.status})` },
      { status: upstream.status },
    );
  }

  // Pass through the relevant content metadata and let the browser cache aggressively —
  // S3 keys carry a timestamp so the URL itself is the cache buster.
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(upstream.body, { status: 200, headers });
}
