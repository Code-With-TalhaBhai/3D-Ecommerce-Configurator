# Issues List

## Issue 1 — `POST /api/vendor/products/upload` returns 500 (Internal Server Error)

**Sprint:** 3–4 — *Upload pipeline* (GLB upload UI, server-side validation, Draco compression, S3 storage, admin review queue).

**Symptom**

When submitting the new-product form at `/vendor/products/new`, the network request fails with:

```
POST http://localhost:3000/api/vendor/products/upload 500 (Internal Server Error)
    at onSubmit (new-product-form.tsx:153)
```

The form shows a generic "Network error" because the 500 response from Next.js had no JSON body, so `await res.json()` in `onSubmit` threw and fell into the outer `catch`.

**Root cause**

The upload route handler (`app/api/vendor/products/upload/route.ts`) had **no top-level `try/catch`**, so any exception raised after the early validation checks bubbled up as a bare Next.js 500. The exception-prone calls that were left unguarded:

1. `prisma.vendor.findUnique(...)` and `prisma.product.create(...)` — throw `PrismaClientValidationError` / `PrismaClientKnownRequestError` on DB issues or when `session.user.id` is missing from an older JWT.
2. The slug uniqueness loop (`prisma.product.findUnique` in a `for` condition).
3. `processGlb(bytes)` — internally, **`io.writeBinary(document)`** in [lib/glb/process.ts](../lib/glb/process.ts) was *not* wrapped in `try/catch`, so a Draco encoder failure (the actual compression happens inside `writeBinary`, not the earlier `document.transform(draco(...))` step) escaped as an unhandled rejection.
4. `getIo()` cached a *rejected* promise on first-call failure, so every subsequent upload kept failing with the same error until the dev server was restarted.

**Fix**

1. **[app/api/vendor/products/upload/route.ts](../app/api/vendor/products/upload/route.ts)** — wrapped the entire `POST` body in `try/catch`. The catch logs the error with `console.error("[/api/vendor/products/upload] unhandled error:", err)` and returns a structured `{ error: "Upload failed: <message>" }` JSON 500 so the form can surface it instead of breaking on `res.json()`.
2. Added an explicit guard for `session.user.id` — returns 401 with a clear "log out and sign in again" message if the JWT predates the `id` callback in [auth.config.ts](../auth.config.ts).
3. **[lib/glb/process.ts](../lib/glb/process.ts)** — wrapped `io.writeBinary(document)` in `try/catch` and converted encoder failures into the structured `{ ok: false, reason: "GLB encoding failed: …" }` result that the route already knows how to render as a 400.
4. **[lib/glb/process.ts](../lib/glb/process.ts)** — made the cached `ioPromise` reset to `null` on rejection, so a transient draco-init failure no longer poisons every subsequent upload.

---

## Issue 2 — `Upload failed: Aborted(Error: ENOENT: ... draco_encoder.wasm)`

**Sprint:** 3–4 — *Upload pipeline* (Draco compression step).

**Symptom**

After Issue 1's logging was added, the upload form now surfaces the real error:

```
Upload failed: Aborted(Error: ENOENT: no such file or directory,
open 'D:\ROOT\node_modules\draco3dgltf\draco_encoder.wasm').
Build with -sASSERTIONS for more info.
```

Notice the path: **`D:\ROOT\node_modules\...`** — that directory does not exist on disk. The project lives at `D:\code_apps\final-year-project`, not `D:\ROOT`.

**Root cause**

`draco3dgltf` is a WebAssembly module. At runtime its JS glue code calls `fs.readFileSync(__dirname + '/draco_encoder.wasm')` to load the `.wasm` binary next to itself. When Next.js / Turbopack bundles the route handler, the `draco3dgltf` package gets pulled into a server chunk under `.next/server/...`, and the build rewrites `__dirname` to a synthetic path (`D:\ROOT\node_modules\draco3dgltf\…`). The bundled chunk no longer sits next to the actual `.wasm` file, so the `readFileSync` call ENOENTs.

This is the standard "WASM next to JS" bundler problem — the JS gets relocated, the `.wasm` does not.

**Fix**

[next.config.ts](../next.config.ts) — added `serverExternalPackages: ["draco3dgltf", "@gltf-transform/core"]`. This tells Next.js to leave both packages as plain `require()` calls resolved from `node_modules` at runtime instead of bundling them. The Emscripten glue then resolves `__dirname` to the real `node_modules/draco3dgltf/` directory and finds `draco_encoder.wasm` next to it. `@gltf-transform/core` is included because it transitively `require()`s draco bindings; keeping the pair external avoids any version of the same indirection.

```ts
// next.config.ts
serverExternalPackages: ["draco3dgltf", "@gltf-transform/core"],
```

A dev-server restart is required after editing `next.config.ts` for the change to take effect.

---

## Issue 3 — `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.`

**Sprint:** 5–6 — *3D viewer* (React Three Fiber viewer, orbit controls, texture/color swap, mobile responsiveness).

**Symptom**

Browser console warning emitted by Three.js whenever a viewer mounts.

**Root cause**

Both [components/viewer/glb-viewer.tsx](../components/viewer/glb-viewer.tsx) and [components/viewer/configurable-viewer.tsx](../components/viewer/configurable-viewer.tsx) used `<Canvas shadows>` (boolean form). In current React-Three-Fiber, `shadows={true}` maps to `THREE.PCFSoftShadowMap`, which the latest Three.js has flagged as deprecated. Three.js falls back to `PCFShadowMap` and logs the warning.

**Fix**

Changed both canvases to the explicit string form `shadows="basic"`, which selects `PCFShadowMap` directly — the same map Three.js was silently falling back to — and silences the warning:

```tsx
<Canvas shadows="basic" ... >
```

`"basic"` was chosen over `"variance"` / `"soft"` because the existing scenes (a single directional light + ambient) don't need soft-shadow filtering and basic PCF renders fastest on mobile, which is consistent with the AGENTS.md §3.3 mobile-first performance target.

**Result of fixes 1–3**

- True application errors return a JSON 500 with the real reason, rendered in the form's red banner instead of swallowed as "Network error".
- User-correctable problems (bad GLB, missing storefront, oversized texture, etc.) continue to return their specific 4xx codes as before.
- The Draco encoder loads its `.wasm` correctly on every upload.
- The viewer no longer logs the deprecated-shadow-map warning.
- The dev terminal logs the underlying stack trace for any future 500, making issues diagnosable in seconds.

---

## Issue 4 — `Model has 378,722 triangles. Max allowed is 100,000.`

**Sprint:** 3–4 — *Upload pipeline* (server-side validation step).

**Symptom**

A realistic vendor product model (378,722 triangles) was rejected by [processGlb](../lib/glb/process.ts) with:

```
Model has 378,722 triangles. Max allowed is 100,000.
```

The model is not pathological — it's a normal mid-detail product mesh well within what modern WebGL on mobile-tier hardware can handle in a single-product viewer.

**Root cause**

Not a bug per se — the guardrail in [lib/glb/limits.ts](../lib/glb/limits.ts) (`MAX_TRIANGLES = 100_000`) was working as designed. The original ceiling was chosen conservatively without survey data on real vendor uploads. 100k turns out to be too aggressive for typical e-commerce product geometry once UV seams, hard edges, and subtle curvature are preserved.

**Fix**

[lib/glb/limits.ts](../lib/glb/limits.ts) — raised `MAX_TRIANGLES` from `100_000` to `500_000`. Rationale:

- Accommodates the rejected model (≈379k) and the vast majority of realistic product meshes.
- Stays well below the threshold where a single-mesh scene becomes janky on mid-range mobile (~700k–1M tri).
- Consistent with AGENTS.md §3.3's "render time target: under 3 seconds on standard broadband" and §4.1's mobile-first performance constraint — Draco compression + CloudFront still handle 500k tri models inside the budget.
- The Sprint 5–6 LOD system (AGENTS.md §3.3) will provide the proper long-term answer for very high-poly models by serving simplified meshes on low-end devices.

```ts
// lib/glb/limits.ts
export const MAX_TRIANGLES = 500_000;
```

**Future work**

If vendors start hitting the 500k ceiling routinely, the next step (Sprint 5–6 territory, alongside LOD) is server-side mesh decimation via `@gltf-transform/functions` `simplify()` — auto-reduce above a threshold instead of rejecting. Out of scope for now.

---

## Issue 5 — `/vendor/products` page shows no 3D preview per product

**Sprint:** 3–4 — *Upload pipeline* (vendor dashboard UI surface) with overlap into 5–6 (3D viewer reuse).

**Symptom**

The vendor's product list at `/vendor/products` rendered only text fields (title, status, price, stock, polys, size, date). No thumbnail and no 3D preview — making it impossible for a vendor to visually identify which product is which once they have more than one upload.

**Root cause**

[app/(vendor)/vendor/products/page.tsx](../app/(vendor)/vendor/products/page.tsx) never selected `glbUrl` from Prisma and never rendered a viewer/thumbnail at all. The schema *does* carry a `thumbnailUrl` column on `Product`, but no thumbnail-generation step has been wired up yet, so even if we'd rendered `<img src={p.thumbnailUrl} />` it would always be empty.

**Fix**

1. Added a lightweight thumbnail-tier viewer at [components/viewer/glb-thumb.tsx](../components/viewer/glb-thumb.tsx) — same Drei `useGLTF` + `<Bounds>` + `<Center>` framing as `GlbViewer`, but **no `OrbitControls`** (so scrolling the list doesn't fight the canvas), `frameloop="demand"` (only renders when something changes — idle thumbnails cost zero GPU), and `powerPreference: "low-power"` for the discrete-GPU machines that try to spin up their dedicated card for a tiny canvas.
2. Wrapped the canvas in a client-only lazy loader at [components/viewer/glb-thumb-lazy.tsx](../components/viewer/glb-thumb-lazy.tsx) — needed for the Server Component boundary, see Issue 7 below.
3. [app/(vendor)/vendor/products/page.tsx](../app/(vendor)/vendor/products/page.tsx) now `select`s `glbUrl` and renders `<GlbThumbLazy src={p.glbUrl} />` in a new 80×80 cell at the front of each row. Falls back to a "3D" placeholder tile when `glbUrl` is null.

**Note**

For lists with many products, rendering one Canvas per row is acceptable while the catalog is small but should be replaced with pre-rendered thumbnails once a Sprint 5–6 LOD/thumbnail bake step exists (write static screenshot to `thumbnailUrl` at upload time and prefer it over a live canvas).

---

## Issue 6 — `/products` page lists no products

**Sprint:** 7–8 — *Marketplace core* (public product listings, search & filtering) intersecting Sprint 3–4 (admin review queue revalidation).

**Symptom**

The public marketplace at `/products` showed the empty-state "No products are live yet. Check back soon." even after products were uploaded via `/vendor/products/new`.

**Root cause**

This is **partly by design and partly a stale-cache bug**:

1. **By design (AGENTS.md §3.7):** new products default to `status: "PENDING"` in the schema. The public listing query in [app/products/page.tsx](../app/products/page.tsx) filters `where: { status: "APPROVED" }`. Until an admin approves a product at `/admin/products`, it is invisible to customers. That part is correct behaviour and matches the spec's admin-approval gate.
2. **Real bug:** the admin's `approveProduct` server action in [app/(admin)/admin/products/actions.ts](../app/(admin)/admin/products/actions.ts) only called `revalidatePath("/admin/products")` and `revalidatePath("/admin")`. It never invalidated `/products` or `/vendor/products`, so even after a successful approval the Next.js full-route cache for the public listing could still serve the pre-approval (empty) HTML. Same omission existed in `rejectProduct`.

**Fix**

[app/(admin)/admin/products/actions.ts](../app/(admin)/admin/products/actions.ts) — both `approveProduct` and `rejectProduct` now also call:

```ts
revalidatePath("/products");
revalidatePath("/vendor/products");
```

After admin approval, the public listing and the vendor's own list both reflect the new status on the next navigation instead of waiting out the cache.

**How to surface products as live**

1. Sign in as an admin user.
2. Visit `/admin/products` (defaults to the **Pending** tab).
3. Press *Approve* on the product card.
4. The product now appears on `/products` immediately.

If no admin user exists in the database yet, promote one manually:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = '<your-email>';
```

This is consistent with AGENTS.md §3.7 — admin approval is mandatory before a product with a 3D model goes live.

---

## Issue 7 — `ssr: false` is not allowed with `next/dynamic` in Server Components

**Sprint:** 3–4 — *Upload pipeline* (vendor dashboard UI surface), surfaced as a follow-up to Issue 5.

**Symptom**

Turbopack failed to compile `/vendor/products` with:

```
In '/vendor/products/page.tsx', `ssr: false` is not allowed with `next/dynamic`
in Server Components. Please move it into a Client Component.
Ecmascript file had an error.
```

**Root cause**

The first cut of the Issue 5 fix put this call directly in [app/(vendor)/vendor/products/page.tsx](../app/(vendor)/vendor/products/page.tsx):

```ts
const GlbThumb = dynamic(
  () => import("@/components/viewer/glb-thumb").then((m) => m.GlbThumb),
  { ssr: false, loading: () => <ThumbPlaceholder /> },
);
```

That page is a Server Component (`async` + uses `auth()` and Prisma). Next.js 14+ rejects `dynamic({ ssr: false })` in Server Components on principle: `ssr: false` is a directive to *skip server rendering*, which is only meaningful from inside a client boundary. Server Components **are** the server output — telling one to skip its own rendering is contradictory, so the compiler refuses.

**Fix**

Moved the `dynamic({ ssr: false })` call into a new `"use client"` shim at [components/viewer/glb-thumb-lazy.tsx](../components/viewer/glb-thumb-lazy.tsx):

```tsx
"use client";
import dynamic from "next/dynamic";

const GlbThumb = dynamic(
  () => import("./glb-thumb").then((m) => m.GlbThumb),
  { ssr: false, loading: () => <ThumbPlaceholder /> },
);

export function GlbThumbLazy({ src, className }: { src: string; className?: string }) {
  return <GlbThumb src={src} className={className} />;
}
```

The vendor products page now imports `<GlbThumbLazy />` like any other client component — no `dynamic()` call in the server module. The R3F Canvas still only loads on the client (it still needs `window`), but the SSR-skip boundary is drawn at the correct layer.

**Takeaway**

Whenever a server-rendered page needs a browser-only component (R3F, Leaflet, Mapbox, anything that touches `window` or `document`), wrap the `dynamic({ ssr: false })` call inside a `"use client"` module and import *that* from the server page. Never put `dynamic` with `ssr: false` directly in a Server Component.

---

## Issue 8 — `Could not load https://…s3.eu-north-1.amazonaws.com/…/shoes-…glb: Failed to fetch`

**Sprint:** 3–4 — *Upload pipeline* (S3 storage / asset delivery side).

**Symptom**

On `/vendor/products`, the new `<GlbThumbLazy>` thumbnails (Issue 5) fail to render and the browser console shows:

```
Could not load https://model-uploader-bucket.s3.eu-north-1.amazonaws.com/
vendors/cmp1v9qkx0001a8vfzngd3p0a/products/shoes-1778586397788.glb:
Failed to fetch.
```

The same URL pasted directly into a browser tab downloads fine — the failure only happens from inside the app.

**Root cause**

`useGLTF` (Three.js `GLTFLoader`) issues a **cross-origin** `fetch` from `http://localhost:3000` to `model-uploader-bucket.s3.eu-north-1.amazonaws.com`. The browser sends an `Origin` header and requires the response to carry an `Access-Control-Allow-Origin` header that includes our origin. The S3 bucket has **no CORS configuration**, so the response comes back without that header and the browser drops it before the loader ever sees the bytes — `fetch` reports the generic `TypeError: Failed to fetch`.

This is unrelated to bucket access policy (the object *is* publicly readable — direct browser navigation works). It's purely the cross-origin pre-flight contract.

**Fix**

Apply a CORS configuration to the `model-uploader-bucket` bucket. The repo now ships the canonical CORS rules at [infra/s3-cors.json](../infra/s3-cors.json):

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["http://localhost:3000", "https://localhost:3000"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

Apply it via the AWS CLI (run from the project root):

```bash
aws s3api put-bucket-cors \
  --bucket model-uploader-bucket \
  --cors-configuration file://infra/s3-cors.json
```

Or via the AWS Console: **S3 → model-uploader-bucket → Permissions → Cross-origin resource sharing (CORS) → Edit → paste the JSON → Save**.

After applying, hard-refresh the browser (CORS responses are cached). The thumbnail and the full viewer at `/products/[slug]` will both load successfully.

**Production note**

Before going live, extend `AllowedOrigins` to include the deployed domain (e.g. `https://configurator.example.com`) and the Vercel preview-deploy wildcard if you use one (`https://*.vercel.app`). Keep `localhost` entries — they're harmless in production and useful for local dev against the real bucket.

**Longer-term path (Sprint 5–6 / 11–12 polish)**

Once a CloudFront distribution is provisioned for the bucket (AGENTS.md §4.1, env var `AWS_CLOUDFRONT_URL`), GLB URLs in the database flip to the CDN origin automatically (the routing already lives in [lib/storage/s3.ts](../lib/storage/s3.ts) `publicUrl`). CloudFront's default response policy forwards CORS headers from S3, so this same `infra/s3-cors.json` keeps the front-end working through the CDN — no additional rules needed.

**Takeaway**

S3 + browser fetch is the most common "looks like a network error, is actually a header" failure mode. Whenever a public S3 URL works in a plain browser tab but `Failed to fetch` from JS, check CORS first.

---

## Issue 9 — `Failed to fetch` persists after CloudFront is configured

**Sprint:** 3–4 — *Upload pipeline* (asset URL persistence) bleeding into 5–6 (viewer wiring) and 11–12 (CDN deployment polish).

**Symptom**

After setting `AWS_CLOUDFRONT_URL` in `.env` and confirming that CloudFront serves objects publicly (direct URL in a browser tab downloads the file), the in-app viewers on `/vendor/products`, `/admin/products`, and `/products/[slug]` **still** report:

```
Could not load https://model-uploader-bucket.s3.eu-north-1.amazonaws.com/.../shoes-…glb:
Failed to fetch.
```

Notice the host: the error references the **bare S3 origin**, not the new CloudFront one — even though `AWS_CLOUDFRONT_URL` is now set.

**Root cause**

Two compounding problems:

1. **Stored URL, not stored key.** The upload route (`app/api/vendor/products/upload/route.ts`) calls `storage.publicUrl(key)` *at upload time* and persists the fully-formed URL in `Product.glbUrl`. [lib/storage/s3.ts](../lib/storage/s3.ts) `publicUrl` consults `process.env.AWS_CLOUDFRONT_URL` only at call time — it has no way to retroactively update rows uploaded when the env var was empty. Result: every product uploaded before CloudFront was provisioned still has an `https://<bucket>.s3.<region>.amazonaws.com/...` URL in the DB.
2. **S3 still has no CORS.** The bare S3 host (which those stale URLs point at) was never given the CORS configuration from Issue 8 — the user moved straight to provisioning CloudFront instead. So those rows continue to CORS-fail exactly like Issue 8.

The fact that CloudFront serves the file publicly when accessed *directly* is a red herring — the browser is never asked to hit CloudFront because the DB row says "go to S3."

**Fix**

Introduce a server-side URL normalizer that rewrites legacy S3 URLs to the current CloudFront origin at **read time**, and apply it everywhere a stored asset URL is rendered.

1. New helper at [lib/storage/cdn.ts](../lib/storage/cdn.ts):

    ```ts
    import "server-only";

    export function toCdnUrl(url: string | null | undefined): string | null {
      if (!url) return null;
      const cdn = process.env.AWS_CLOUDFRONT_URL?.replace(/\/$/, "");
      if (!cdn) return url;
      if (url.startsWith(cdn)) return url;
      const m = url.match(/^https?:\/\/[^/]+\.s3(?:[.-][^/]+)?\.amazonaws\.com\/(.+)$/);
      if (!m) return url;
      return `${cdn}/${m[1]}`;
    }
    ```

    Idempotent: passes CloudFront URLs through unchanged, returns the original when `AWS_CLOUDFRONT_URL` is empty (local dev against S3 only), and matches both `<bucket>.s3.amazonaws.com` and `<bucket>.s3.<region>.amazonaws.com` virtual-hosted styles.

2. Applied at every server-component read site so the client only ever sees the CloudFront URL:

    - [app/(vendor)/vendor/products/page.tsx](../app/(vendor)/vendor/products/page.tsx) — `<GlbThumbLazy src={toCdnUrl(p.glbUrl)!} />`
    - [app/(admin)/admin/products/page.tsx](../app/(admin)/admin/products/page.tsx) — `glbUrl: toCdnUrl(p.glbUrl)` in the props passed to `ReviewCard`.
    - [app/products/[slug]/page.tsx](../app/products/[slug]/page.tsx) — rewrites `glbUrl`, `thumbnailUrl`, every `variant.textureUrl`, **and** the OpenGraph image in metadata.
    - [app/products/page.tsx](../app/products/page.tsx) — rewrites `thumbnailUrl` on each marketplace card.

3. The upload route itself needs no change: `storage.publicUrl()` already returns a CloudFront URL when `AWS_CLOUDFRONT_URL` is set, so new uploads go straight to the right host and the normalizer is a no-op for them.

**Why this approach over a one-shot DB backfill**

A migration script that walks `Product`/`ProductVariant` and rewrites every stored URL would work today but breaks again the next time the CDN origin moves (e.g. switching to a custom domain, adding a staging-bucket Distribution, regional rollouts). Reading the URL through `toCdnUrl()` makes the storage layer durable across any future origin change — the DB stores "where the bytes live," the helper decides "how today's browser should reach them."

The right architectural endgame is to store *only the S3 key* in `Product.glbKey` (not the URL) and call `storage.publicUrl(key)` on every read. That's a small schema migration deferred to Sprint 11–12 polish; `toCdnUrl()` is the no-migration bridge until then.

**Required CloudFront-side configuration**

Code alone isn't enough — CloudFront also needs CORS, and by default it has none. Two options, in increasing order of correctness:

1. **Fastest (recommended for now):** attach the AWS-managed **`Managed-SimpleCORS`** Response Headers Policy to the distribution's default cache behavior. AWS Console → CloudFront → your distribution → Behaviors → Default (\*) → Edit → Response headers policy → **SimpleCORS** → Save. Re-deploys in ~3 minutes; CloudFront then injects `Access-Control-Allow-Origin: *` on every response. Hard-refresh the browser afterwards because CORS responses are cached.
2. **Production-grade:** keep [infra/s3-cors.json](../infra/s3-cors.json) on the bucket *and* configure the CloudFront cache behavior to forward the `Origin` header to S3 (Origin Request Policy: `Managed-CORS-S3Origin`). CloudFront then mirrors whatever CORS S3 returns — letting you constrain `AllowedOrigins` to your production domains instead of the wildcard.

**Takeaway**

Never persist a fully-formed CDN URL in the database — the URL is an *infrastructure detail*, not a property of the asset. Store the key and compute the URL on every read (or, as a stop-gap, normalize at the read site like `toCdnUrl()` does). Otherwise every CDN migration becomes a data migration.

---

## Issue 10 — `Failed to fetch` persists even after CloudFront URL rewrite

**Sprint:** 3–4 — *Upload pipeline* (asset delivery) with overlap into 11–12 (CDN polish).

**Symptom**

After Issue 9's `toCdnUrl()` was applied, the URL the browser tries to fetch is now correctly on the CloudFront origin — but the loader still throws:

```
[browser] Uncaught Error: Could not load https://d25hh8ye8oo9n5.cloudfront.net/
  vendors/cmp1v9qkx0001a8vfzngd3p0a/products/shoes-1778586397788.glb:
  Failed to fetch
    at ProductDetailPage (app/products/[slug]/page.tsx:74:7)
```

Note the host — it's `d25hh8ye8oo9n5.cloudfront.net`, not the S3 host. So the rewrite is doing its job; the remaining failure is on CloudFront's side.

**Root cause**

CloudFront, by default, **does not return CORS headers**. You can confirm by curling the URL with `-H "Origin: http://localhost:3000" -I` — the response is missing `Access-Control-Allow-Origin`. The browser drops the response and `fetch` returns the same `TypeError: Failed to fetch` as in Issues 8 and 9.

The fix Issue 9 prescribed (attach AWS-managed `Managed-SimpleCORS` Response Headers Policy in the CloudFront Console) hadn't yet been applied. Even after applying it, CloudFront's edge nodes take a few minutes to propagate the new policy, and the browser caches CORS preflight responses for `Access-Control-Max-Age` seconds — so a stale negative result can keep biting after the AWS-side change.

**Fix**

Sidestep CORS entirely with a **same-origin asset proxy**. The browser fetches `/api/assets/<key>` (same origin as the app → no CORS handshake), and the Next.js server streams the object from CloudFront server-to-server (server-to-server has no Origin header → no CORS check on the upstream either).

1. New route at [app/api/assets/[...key]/route.ts](../app/api/assets/[...key]/route.ts):

    ```ts
    export async function GET(_req, { params }) {
      const { key: keyParts } = await params;
      const key = keyParts.map(decodeURIComponent).join("/");
      const upstreamUrl = storage.publicUrl(key);
      const upstream = await fetch(upstreamUrl, { cache: "no-store" });
      // ...pass through content-type + content-length, set immutable cache-control...
      return new Response(upstream.body, { status: 200, headers });
    }
    ```

    Catch-all `[...key]` because S3 keys contain `/`. Each segment is `decodeURIComponent`'d on the way in (and the client encodes them on the way out — see step 2) so keys with spaces or unicode survive routing.

2. [lib/storage/cdn.ts](../lib/storage/cdn.ts) — `toCdnUrl()` now extracts the key from any S3 or CloudFront URL and rewrites to `/api/assets/<encoded-key>`:

    ```ts
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `/api/assets/${encoded}`;
    ```

    All four call sites from Issue 9 (vendor list, admin queue, product detail, marketplace) continue to call `toCdnUrl()` unchanged — only the *shape* of what it returns changed.

3. Idempotent + reversible:
    - If a URL is already a proxy path (`/api/assets/...`), it's returned unchanged (lets us re-run the helper safely).
    - Set `ASSET_PROXY=false` in `.env` to bypass the proxy and serve direct CloudFront URLs — once `Managed-SimpleCORS` is attached and propagated, flip this to get CDN-direct delivery back.

**Trade-offs**

- **Pro:** zero AWS-console work to unblock dev. CORS questions are out of the loop entirely.
- **Pro:** the route handler can later be extended with auth (e.g. signed-url checks for private products) without touching anything else.
- **Con:** every asset byte flows through the Next.js server instead of straight from a CDN edge to the user. Fine for dev and early traffic; a real bottleneck at scale.
- **Con:** Vercel's serverless function payload limit (4.5 MB on the free tier, 50 MB on Pro) would cap GLB sizes once deployed. Streaming through `Response(upstream.body)` keeps memory low but the response body still counts toward the limit. Production must run with `ASSET_PROXY=false` + working CloudFront CORS.

**When to flip back to direct CDN delivery**

Once you've attached `Managed-SimpleCORS` to the CloudFront distribution and waited ~3 minutes for propagation:

```
ASSET_PROXY=false
```

…in `.env` (and on Vercel). `toCdnUrl()` then returns the bare CloudFront URL again, restoring CDN-direct delivery.

**Takeaway**

CORS errors on third-party CDNs have two clean solutions: configure the CDN to send the right headers (correct, fast, requires console access and propagation time), or proxy through your own origin (works always, costs runtime). Have both available behind a single env-var toggle so you can pick whichever fits the moment.

---

## Issue 11 — `Cannot read properties of undefined (reading 'x')` upgrading materials in the configurable viewer

**Sprint:** 5–6 — *3D viewer* (texture/color/material customization).

**Symptom**

When the product-detail page mounts `<ConfigurableViewer>` and the user enters the customization flow, React throws at runtime:

```
Runtime TypeError
Cannot read properties of undefined (reading 'x')
components/viewer/configurable-viewer.tsx (54:14) @ ConfigurableModel.useEffect.upgraded
```

The model never appears; the configurator UI is dead on arrival.

**Root cause**

[components/viewer/configurable-viewer.tsx](../components/viewer/configurable-viewer.tsx) walks the GLB scene, clones every material as `MeshPhysicalMaterial` (a superset of `MeshStandardMaterial`, adding clearcoat etc.), and snapshots the originals so it can restore them when the user clears overrides. The clone path was:

```ts
const next = new THREE.MeshPhysicalMaterial();
next.copy(m as THREE.MeshStandardMaterial);
```

The `as THREE.MeshStandardMaterial` cast was a TypeScript-only assertion — at runtime `m` can be **any** `THREE.Material` subclass, including `MeshBasicMaterial`, `MeshLambertMaterial`, `MeshPhongMaterial`, or `MeshToonMaterial` for older GLB exports. Under the hood, `MeshPhysicalMaterial.copy` chains up through `MeshStandardMaterial.copy`, which does:

```ts
this.normalScale.copy(source.normalScale);
this.clearcoatNormalScale.copy(source.clearcoatNormalScale);
```

…which reads `source.normalScale.x` and `.y`. Non-PBR materials don't have a `normalScale` Vector2, so `source.normalScale` is `undefined` → the recursive `.copy(undefined)` call dereferences `.x` and throws. The error frame name `useEffect.upgraded` is the synthetic name of the inner `.map(…)` callback where the failure happens.

**Fix**

Stopped lying to the type system and started branching on the actual runtime class. Added a hand-rolled `copyMaterialSafely()` helper that copies only the fields every `THREE.Material` is guaranteed to have, plus the optional `color` / `map` / `alphaMap` fields most user-facing materials carry:

```ts
function copyMaterialSafely(target: THREE.MeshPhysicalMaterial, source: THREE.Material) {
  target.name = source.name;
  target.transparent = source.transparent;
  target.opacity = source.opacity;
  target.side = source.side;
  target.visible = source.visible;
  target.depthTest = source.depthTest;
  target.depthWrite = source.depthWrite;
  target.alphaTest = source.alphaTest;

  const src = source as unknown as Record<string, unknown>;
  if (src.color instanceof THREE.Color) target.color.copy(src.color);
  if (src.map === null || src.map instanceof THREE.Texture) target.map = src.map ?? null;
  if (src.alphaMap === null || src.alphaMap instanceof THREE.Texture) {
    target.alphaMap = src.alphaMap ?? null;
  }
}
```

The upgrade pass now branches on the source class:

```ts
if (m instanceof THREE.MeshPhysicalMaterial) return m.clone() as THREE.MeshPhysicalMaterial;
const next = new THREE.MeshPhysicalMaterial();
if (m instanceof THREE.MeshStandardMaterial) {
  try { next.copy(m); } catch { copyMaterialSafely(next, m); }
} else {
  copyMaterialSafely(next, m);
}
```

The `try/catch` belt-and-suspenders inside the `MeshStandardMaterial` branch covers the rare case where a GLTFLoader-produced standard material has had its `normalScale` stripped by a post-processor — we fall back to the safe path instead of crashing.

**Effect**

- GLBs authored against any of the legacy non-PBR materials now load cleanly.
- Re-tinting via the color picker, swapping textures, and the roughness/metalness/clearcoat sliders all keep working — they only touch fields that `MeshPhysicalMaterial` initializes itself, so they're independent of which fields were copied from the source.

**Takeaway**

`thing as ExpectedType` in TypeScript is a *promise to the compiler*, not a *check against reality*. Whenever a downstream library (Three.js's material copy chain here) reaches into structural fields the cast claims exist, the cast becomes a load-bearing lie. Use `instanceof` to branch on the actual class, and write the safe-subset path for everything else.
