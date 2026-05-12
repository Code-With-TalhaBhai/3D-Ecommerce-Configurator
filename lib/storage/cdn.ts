import "server-only";

/**
 * Rewrite a stored asset URL to the form the browser should request.
 *
 * Returns a **same-origin proxy URL** (`/api/assets/<key>`) by default, so
 * the browser never makes a cross-origin request — no CORS handshake, no
 * S3-side or CloudFront-side header configuration required. The proxy at
 * `app/api/assets/[...key]/route.ts` then streams the bytes from
 * `storage.publicUrl(key)` server-to-server, which transparently uses
 * CloudFront when `AWS_CLOUDFRONT_URL` is set and falls back to direct S3
 * otherwise.
 *
 * To bypass the proxy and serve direct CDN URLs (faster, but requires
 * CloudFront CORS to be configured — see Issue 10 in specs/issues-list.md),
 * set `ASSET_PROXY=false` in the environment.
 *
 * Idempotent: gracefully accepts proxy URLs, S3 URLs, and CloudFront URLs.
 */
export function toCdnUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Already a same-origin proxy path → leave as-is.
  if (url.startsWith("/api/assets/")) return url;

  const key = extractKey(url);

  if (process.env.ASSET_PROXY === "false") {
    // Direct-CDN mode: return CloudFront URL when configured, else the original URL.
    const cdn = process.env.AWS_CLOUDFRONT_URL?.replace(/\/$/, "");
    if (!cdn || !key) return url;
    return `${cdn}/${key}`;
  }

  // Proxy mode (default). Each path segment is encoded so keys with spaces or unicode survive routing.
  if (!key) return url;
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `/api/assets/${encoded}`;
}

/** Pull the S3 object key out of any URL we've ever issued for it. */
function extractKey(url: string): string | null {
  const cdn = process.env.AWS_CLOUDFRONT_URL?.replace(/\/$/, "");
  if (cdn && url.startsWith(`${cdn}/`)) {
    return url.slice(cdn.length + 1);
  }
  const m = url.match(/^https?:\/\/[^/]+\.s3(?:[.-][^/]+)?\.amazonaws\.com\/(.+)$/);
  return m ? m[1] : null;
}
