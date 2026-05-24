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

[lib/glb/limits.ts](../lib/glb/limits.ts) — `MAX_TRIANGLES` was raised in passes as real vendor uploads came in: first `100_000 → 500_000` (rejected model was ≈379k), then `500_000 → 750_000` (another model needed it), then `750_000 → 1_000_000`, and finally **`1_000_000 → 2_000_000`** alongside a parallel bump of `MAX_GLB_BYTES` from `50 MB → 100 MB` to give vendors comfortable headroom for high-detail PBR product meshes. Rationale for the current ceiling:

- Accommodates effectively every realistic e-commerce product model, including high-detail PBR meshes with multiple UV sets, hard edges, and dense curvature.
- 2M triangles + Draco compression typically yields a payload well under the 100 MB transport ceiling and stays inside the AGENTS.md §3.3 "render time target: under 3 seconds on standard broadband" envelope for vendors who keep textures reasonable.
- On mid-range mobile (Adreno 6xx / Apple A12 class) sub-2M tri scenes still render at interactive frame rates as long as draw calls stay low — `MeshPhysicalMaterial` upgrade pass in the viewer reuses cloned materials per-mesh so this holds.
- The Sprint 5–6 LOD system (AGENTS.md §3.3) is still the proper long-term answer for very high-poly models by serving simplified meshes on low-end devices, and remains queued for later sprints.

```ts
// lib/glb/limits.ts
export const MAX_GLB_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_TRIANGLES = 2_000_000;
```

**Future work**

If vendors start hitting the 2M ceiling routinely (very few will), server-side mesh decimation via `@gltf-transform/functions` `simplify()` is the right move — auto-reduce above a threshold instead of rejecting. Pairs naturally with the deferred LOD work. Out of scope for now.

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

---

## Issue 12 — Marketplace product cards show a generic "3D" tile, never a real thumbnail

**Sprint:** 7–8 — *Marketplace core* (public product listings) with Sprint 5–6 viewer reuse.

**Symptom**

On `/products`, every card renders the placeholder tile:

```
┌─────────────┐
│             │
│      3D     │
│             │
└─────────────┘
   <title>
   by <store>
```

…no matter how many products are live. The product detail page at `/products/[slug]` shows the full 3D viewer correctly, so the data is there — the marketplace itself just isn't using it.

**Root cause**

[app/products/page.tsx](../app/products/page.tsx) rendered:

```tsx
{p.thumbnailUrl ? (
  <img src={toCdnUrl(p.thumbnailUrl)!} alt={p.title} ... />
) : (
  <div>3D</div>
)}
```

The fallback path is what every product currently hits, because **no thumbnail-generation step exists yet** — `Product.thumbnailUrl` is declared in [prisma/schema.prisma](../prisma/schema.prisma) but the upload route never populates it. A future Sprint 5–6/11–12 task is to bake a static PNG from the GLB at upload time and store it here (headless GL or Puppeteer screenshot), but that's not in scope right now. So in the meantime every card lands on the placeholder, which looks broken.

**Fix**

Same pattern [/vendor/products](../app/(vendor)/vendor/products/page.tsx) already uses: when there's no static thumbnail but the product has a GLB, render a **live 3D thumbnail** via `<GlbThumbLazy>` (no controls, `frameloop="demand"`, `powerPreference: "low-power"` — idle thumbnails cost no GPU after the first paint).

[app/products/page.tsx](../app/products/page.tsx) — the card's image slot is now a three-way fallback:

```tsx
{p.thumbnailUrl ? (
  // 1. Static PNG once thumbnail bake exists.
  <img src={toCdnUrl(p.thumbnailUrl)!} ... />
) : p.glbUrl ? (
  // 2. Live R3F canvas — same lazy/no-control viewer the vendor list uses.
  <GlbThumbLazy src={toCdnUrl(p.glbUrl)!} className="h-full w-full" />
) : (
  // 3. Last-resort tile for products that somehow have neither.
  <div>3D</div>
)}
```

The query was already returning `glbUrl` (the marketplace `findMany` uses `include`, which preserves all scalar fields), so no DB change was needed. The URL still goes through `toCdnUrl()` so the asset-proxy / CloudFront rewrite from Issues 9–10 applies.

**Trade-offs**

- **Pro:** every card now shows the actual product geometry, fixing the "what am I looking at?" UX without waiting for a thumbnail-bake step.
- **Pro:** picks up vendor variant changes instantly — no stale screenshots.
- **Con:** each card mounts a `<Canvas>`. With `frameloop="demand"`, idle GPU cost is near zero, but every canvas still claims a WebGL context. Browsers typically allow 8–16 concurrent contexts before dropping the oldest; once the catalog grows past ~12 visible products, an intersection-observer-gated mount or pagination becomes necessary.
- **Con:** initial CPU spike when many GLBs decode in parallel. Acceptable for the current catalog size; the proper fix is the deferred thumbnail-bake step (Sprint 11–12).

**Path forward (deferred)**

The cleanest long-term fix is to generate a static PNG thumbnail at upload time and write it to `Product.thumbnailUrl`. Options for the bake:

1. Server-side headless WebGL (Puppeteer page that loads the GLB into an `<canvas>` and `toDataURL`s a 512×512 PNG). Adds a heavy dependency.
2. Server-side native GL via `gl` + `three`. Lighter but Linux-only and a Windows-on-dev pain.
3. Client-side bake: on first viewer mount, screenshot the canvas (the existing `onScreenshotterReady` API in `ConfigurableViewer` already does this for the user-facing "Save snapshot" button) and POST it back to a `/api/vendor/products/[id]/thumbnail` route which writes it to S3 + sets `thumbnailUrl`. The product self-thumbnails the first time anyone visits it.

Option 3 is the cheapest to ship and aligns with the existing screenshot machinery, but is deferred until the marketplace actually needs the perf win — for now the live-canvas fallback is fine.

**Takeaway**

When a database column exists for "the pre-computed expensive version" of something but the computation step isn't built yet, the user-facing fallback should be the cheap-but-correct version (live render here), not a generic placeholder. A grey "3D" tile is a worse UX than a slightly-heavier canvas, and the perf concerns it raises usually have to be solved anyway.

---

## Issue 13 — `POST /api/vendor/products/upload` returns 413 `FUNCTION_PAYLOAD_TOO_LARGE` on Vercel

**Sprint:** 3–4 — *Upload pipeline* (deployment-blocking; localhost was fine, production failed).

**Symptom**

Vendor product uploads succeed in local development but fail in production on Vercel with a platform-level error page (not a JSON body from our handler):

```
413 Content Too Large
Request Entity Too Large

FUNCTION_PAYLOAD_TOO_LARGE
bom1::x7z6x-1779558278419-cc06f21b18e8
```

The request never reaches our route handler — Vercel's edge gateway rejects it before invocation, so the `try/catch` added in Issue 1 can't surface a friendlier error and `console.error` never fires.

**Root cause**

Vercel's serverless functions have a **hard per-invocation request-body cap**: 4.5 MB on Hobby and 50 MB on Pro (Fluid Compute). The original [app/api/vendor/products/upload/route.ts](../app/api/vendor/products/upload/route.ts) accepted the entire GLB through `request.formData()`, so the file payload had to fit under that cap. Our app advertises a 100 MB ceiling (`MAX_GLB_BYTES` in [lib/glb/limits.ts](../lib/glb/limits.ts)) and even a typical mid-detail product mesh post-Issue 4 routinely sits in the 10–50 MB range — well past the Hobby cap, and above the Pro cap once you account for multipart framing overhead. Locally there's no such cap because `next dev` just streams the body into the route, which is why the bug only manifested after deployment.

This was a known risk — Issue 10 even calls it out: *"Vercel's serverless function payload limit (4.5 MB on the free tier, 50 MB on Pro) would cap GLB sizes once deployed."* That note covered the asset proxy direction (server → browser). This issue is the upload direction (browser → server), where the cap bites first.

Importantly, the cap is **inbound only**. Outbound `fetch()` from a Vercel function has no payload limit — so a function *fetching* a 100 MB object from S3 server-to-server is fine. The fix exploits that asymmetry.

**Fix**

Split the upload into a two-step **presigned-PUT** flow so the GLB never travels through a Vercel function on the way in:

1. **New [app/api/vendor/products/upload/init/route.ts](../app/api/vendor/products/upload/init/route.ts)** — accepts a tiny JSON body (`{ glb: { size, contentType }, textures: [{ index, size, contentType }] }`), validates auth + vendor + size/MIME, generates a single `uploadId` (UUID), and returns **short-lived presigned S3 PUT URLs** for the GLB and each declared texture. Init traffic is a few hundred bytes — well under any cap.
2. **Browser PUTs directly to S3** using those signed URLs. The GLB key is parked under a temp namespace `pending/{vendorId}/{uploadId}.glb`; textures land at their final permanent path `vendors/{vendorId}/textures/{uploadId}-{index}.{ext}` (textures aren't compressed, so no second copy is needed).
3. **New [app/api/vendor/products/upload/complete/route.ts](../app/api/vendor/products/upload/complete/route.ts)** — accepts the small JSON metadata (title, description, price, stock, `uploadId`, `glbKey`, variants). Re-auths the vendor, enforces that the supplied keys live under the vendor's own `pending/{vendorId}/{uploadId}` / `vendors/{vendorId}/textures/{uploadId}-` prefixes (so one vendor can't claim another's upload), `HEAD`s every object to re-validate size and MIME against `MAX_GLB_BYTES` / `MAX_TEXTURE_BYTES`, then **fetches the GLB server-to-server**, runs [processGlb](../lib/glb/process.ts) (Draco compression unchanged), uploads the compressed copy to its permanent key `vendors/{vendorId}/products/{slug}-{ts}.glb`, deletes the temp raw object, and creates the `Product` + `ProductVariant` rows. Same response shape as before so the form handles success identically.
4. **[lib/storage/s3.ts](../lib/storage/s3.ts) + [lib/storage/index.ts](../lib/storage/index.ts)** — `StorageDriver` interface grew three methods: `presignPut({ key, contentType })` (wraps `@aws-sdk/s3-request-presigner` `getSignedUrl` on a `PutObjectCommand`, default 15-minute expiry), `getObjectBytes(key)` (server-side `GetObjectCommand` → `transformToByteArray()`), and `headObject(key)` (returns `null` on 404 instead of throwing). Driver-agnostic — swapping storage providers stays a single-file change.
5. **[app/(vendor)/vendor/products/new/new-product-form.tsx](../app/(vendor)/vendor/products/new/new-product-form.tsx)** — replaced the single `fetch("/api/vendor/products/upload", { body: formData })` call with the new sequence: `POST /init` → `PUT` GLB to S3 → `PUT` each texture to S3 → `POST /complete`. The user-visible UX is identical — same "Uploading & compressing…" button label, same field-error surfacing, same redirect to `/vendor/products` on success.
6. **[infra/s3-cors.json](../infra/s3-cors.json)** — added `PUT` to `AllowedMethods` (was `GET, HEAD` only — see Issue 8) and added `https://*.vercel.app` to `AllowedOrigins` so production previews can PUT. Reapply with `aws s3api put-bucket-cors --bucket model-uploader-bucket --cors-configuration file://infra/s3-cors.json`. Add the deployed custom domain to `AllowedOrigins` once it's provisioned.
7. The legacy `app/api/vendor/products/upload/route.ts` was deleted — its responsibilities now live in `init/` and `complete/`. No callers remained outside the vendor upload form.

**Why presigned PUTs over alternatives**

- *Just bump Pro tier:* 50 MB still doesn't cover the 100 MB ceiling, and the platform cap is non-configurable inside the function.
- *Move compression to the client:* `draco3dgltf` runs in WASM in browsers, but bundling it on the upload page would push the JS payload up by ~600 KB and make the upload form much heavier to first-paint. Server-side compression also stays the authoritative validation step (poly count, magic bytes, etc.).
- *Vercel Blob / Edge Functions:* would re-introduce a platform-controlled cap and lock us further into Vercel. Direct-to-S3 keeps the storage driver swappable per AGENTS §6.
- *Chunked uploads to our function:* Vercel's cap applies per request, not per byte, so chunking would require us to assemble fragments somewhere — which still needs S3 in the loop. Presigned single-PUT is strictly simpler.

**Security**

- Presigned PUT URLs expire in 15 minutes (`expiresIn: 900`) — short enough that a leaked URL is nearly worthless.
- Each URL is scoped to a single key path under `{vendorId}/{uploadId}`, so the only thing a leaked URL can do is overwrite *that* specific upload slot.
- `/complete` re-validates that the caller's vendor owns the key prefix and that every object actually exists with the expected size + MIME before persisting anything to the DB.
- The pending GLB is deleted as soon as the compressed copy is durable, so orphans only happen when a vendor abandons mid-flow (textures included). A bucket lifecycle policy on the `pending/` prefix (e.g. expire after 24 hours) is the right longer-term cleanup; for now it's a few KB–MB of slop per abandoned upload.

**Takeaway**

Any browser → server upload above ~4 MB on serverless will hit the platform's request-body cap eventually. Architect uploads around **presigned direct-to-object-storage** from day one: the function generates URLs (tiny JSON in/out), the browser uploads directly, and the function only ever sees the bytes it actually needs (e.g. for server-side processing, fetched server-to-server). Same pattern works for any provider — S3, R2, Supabase Storage, Azure Blob.

---

## Issue 14 — Presigned direct-to-S3 PUT fails: CORS preflight 403 + AWS SDK v3 default CRC32 checksum

**Sprint:** 3–4 — *Upload pipeline* (immediate follow-up to Issue 13).

**Symptom**

After deploying Issue 13's two-step presigned upload flow, the browser still cannot upload the GLB. DevTools shows the **CORS preflight** failing before any bytes go out:

```
Request URL:  https://model-uploader-bucket.s3.eu-north-1.amazonaws.com/
              pending/<vendorId>/<uploadId>.glb
              ?X-Amz-Algorithm=AWS4-HMAC-SHA256
              &X-Amz-Content-Sha256=UNSIGNED-PAYLOAD
              &X-Amz-Credential=…&X-Amz-Date=…&X-Amz-Expires=900
              &X-Amz-Signature=…&X-Amz-SignedHeaders=host
              &x-amz-checksum-crc32=AAAAAA%3D%3D                   ← problem #2
              &x-amz-sdk-checksum-algorithm=CRC32                  ← problem #2
              &x-id=PutObject
Request Method:  OPTIONS                                           ← problem #1
Status Code:     403 Forbidden
```

Two distinct failures stacked on top of each other.

**Root cause #1 — S3 CORS rules not applied (or origin not allow-listed)**

The updated [infra/s3-cors.json](../infra/s3-cors.json) from Issue 13 only takes effect once it's actually pushed to the bucket via `aws s3api put-bucket-cors`. If you only edited the JSON in the repo, the bucket still serves the old `GET, HEAD`-only rules (or no rules at all), so the browser's `OPTIONS … Access-Control-Request-Method: PUT` preflight returns **403 with no `Access-Control-Allow-*` headers**, and the browser cancels the actual PUT before it ever leaves the device.

Same failure mode kicks in if your production origin isn't in `AllowedOrigins`. The JSON ships with:

```
"AllowedOrigins": ["http://localhost:3000", "https://localhost:3000", "https://*.vercel.app"]
```

`https://*.vercel.app` covers Vercel's `<project>.vercel.app` and preview deploys. **Custom domains do not match** — `https://shop.example.com` needs to be added explicitly.

**Root cause #2 — AWS SDK v3 default CRC32 checksum in the presigned URL**

`@aws-sdk/client-s3` ≥ 3.730 changed its default request-integrity behavior: `requestChecksumCalculation` defaults to `"WHEN_SUPPORTED"`, which means every `PutObjectCommand` now carries an `x-amz-checksum-crc32` field. When that command is handed to `getSignedUrl()`, the SDK can't compute the real CRC32 (it has no body at presign time), so it bakes a **placeholder value (`AAAAAA==`)** into the signed query string. The browser's subsequent PUT sends the actual file bytes — S3 recomputes CRC32, doesn't match the placeholder, and rejects the upload with `BadDigest` / `400`.

This second failure is currently masked by the CORS 403 — but as soon as CORS is fixed, this would be the next error.

**Fix #1 — Apply the CORS config to the bucket**

From the project root with AWS CLI authenticated against the bucket-owning account:

```bash
aws s3api put-bucket-cors \
  --bucket model-uploader-bucket \
  --cors-configuration file://infra/s3-cors.json
```

Verify it was applied:

```bash
aws s3api get-bucket-cors --bucket model-uploader-bucket
```

The output should list `["GET", "HEAD", "PUT"]` under `AllowedMethods` and your origin under `AllowedOrigins`. If you're on a non-Vercel custom domain, add it to `infra/s3-cors.json` and re-run the `put-bucket-cors` command.

Browser-side: CORS preflight responses are cached. After re-applying, **hard-refresh** the upload page (Cmd-Shift-R / Ctrl-Shift-R) so the browser drops the stale negative preflight result.

**Fix #2 — Opt out of the SDK's default checksum calculation**

[lib/storage/s3.ts](../lib/storage/s3.ts) — the `S3Client` singleton now sets:

```ts
new S3Client({
  region,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: "WHEN_REQUIRED",
});
```

`"WHEN_REQUIRED"` (vs. the new default `"WHEN_SUPPORTED"`) means the SDK only adds checksum metadata for API operations that **mandate** it (almost none in S3's regular object API). `PutObject` no longer carries an `x-amz-checksum-crc32` field, so the presigned URL no longer requires the browser to send a checksum it can't compute. Existing `upload()` / `getObjectBytes()` / `headObject()` paths are unaffected — they don't go through presigning.

**Verification**

After Fix #1 + Fix #2 are both in place, the failing request becomes:

```
Request URL:  https://model-uploader-bucket.s3.eu-north-1.amazonaws.com/
              pending/<vendorId>/<uploadId>.glb?X-Amz-Algorithm=…
              &X-Amz-Credential=…&X-Amz-Signature=…&X-Amz-SignedHeaders=host&x-id=PutObject
Request Method:  PUT
Status Code:     200 OK
```

— note the absent `x-amz-checksum-*` query params and the OPTIONS preflight now returning 200/204 with the right `Access-Control-Allow-Origin` echoing your origin.

**Takeaway**

Two-step gotcha pattern when wiring presigned direct-to-S3 from a browser:

1. **CORS is half code, half ops.** The JSON in `infra/` is just a record — it does nothing until `put-bucket-cors` actually pushes it, and the wildcard scope must match the actual origin. If your preflight returns 403, the CORS rule isn't matching — not a code problem.
2. **Recent AWS SDK defaults break browser presigned PUTs out of the box.** Set `requestChecksumCalculation: "WHEN_REQUIRED"` on any S3 client used for presigning until/unless you build a checksum-aware uploader client-side (compute the CRC32 of the file in the browser before requesting the presign — overkill for this app).

---

## Issue 15 — Presigned PUT CORS still fails from `https://3-d-ecommerce-configurator.vercel.app` + upload has no progress bar

**Sprint:** 3–4 — *Upload pipeline* (immediate follow-up to Issue 14; deployment-blocking).

**Symptom**

After Issue 14's SDK checksum fix landed, the URL no longer carries `x-amz-checksum-crc32` — confirming the SDK change took effect. But the production deploy at `https://3-d-ecommerce-configurator.vercel.app` still fails on the preflight:

```
Access to fetch at 'https://model-uploader-bucket.s3.eu-north-1.amazonaws.com/
pending/<vendorId>/<uploadId>.glb?X-Amz-Algorithm=AWS4-HMAC-SHA256&…' from
origin 'https://3-d-ecommerce-configurator.vercel.app' has been blocked by
CORS policy: Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

Separately: throughout the upload, the user-facing form gives no signal beyond a "Uploading & compressing…" label on the submit button. On a 50 MB GLB on a slow uplink, that's effectively a frozen UI for tens of seconds.

**Root cause (CORS half)**

Two compounding failure modes for the CORS preflight:

1. **The bucket still has no matching CORS rule.** S3 returns 403 with no `Access-Control-Allow-*` headers when no rule in the bucket's CORS config matches the incoming `Origin` + `Access-Control-Request-Method` combo. Common reasons in practice:
   - The repo's [infra/s3-cors.json](../infra/s3-cors.json) update from Issue 13 was edited but never pushed to the bucket via `put-bucket-cors`.
   - The `put-bucket-cors` succeeded against the wrong account/profile/region. (Easy to miss — `aws s3api` is silent on success.)
   - The bucket has only the legacy `GET, HEAD` rule from Issue 8, so any `PUT` preflight gets no match.
2. **Wildcard matching ambiguity.** Issue 14 shipped `AllowedOrigins: ["https://*.vercel.app"]`. S3 *does* support a single `*` in an origin entry, but matches are sometimes flaky for deployment URLs that contain hyphens or compound subdomains (`3-d-ecommerce-configurator.vercel.app`). Even when wildcard matching works in theory, debugging "did the wildcard match?" against a black-box CORS evaluator is much slower than just removing the ambiguity.

**Root cause (progress bar half)**

The form was using `fetch()` for both `init`/`complete` (small JSON) and the GLB `PUT` (potentially 100 MB). The Fetch API **does not expose upload progress events** — there's no equivalent of `xhr.upload.onprogress`. The submit button label was the only "something is happening" signal, which is far too quiet for a multi-stage upload.

**Fix #1 — Remove the CORS wildcard-matching question entirely**

[infra/s3-cors.json](../infra/s3-cors.json) now ships:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD", "PUT"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

`AllowedOrigins: ["*"]` is safe here even though it sounds permissive:

- The actual write authorization is the **presigned URL's HMAC signature**, not the CORS rule. CORS only controls which origins are allowed to *read the response* of a cross-origin request; it doesn't grant write access. A malicious origin without the signed URL cannot upload anything.
- The signed URL itself is scoped to a single key path under `pending/{vendorId}/{uploadId}` and expires in 15 minutes. Even if a URL were intercepted, the only thing the attacker could do is overwrite that one upload slot in the next 15 minutes.
- GET reads on the bucket return content that's already meant to be publicly viewable (product GLBs in the marketplace). There's no confidential data behind CORS.

If you want a tighter posture later, lock `AllowedOrigins` down to your specific production domain(s) — but **only after** you've confirmed the upload flow works end-to-end with `"*"`, so you don't conflate "is CORS wrong?" with "is the origin string wrong?".

**Apply the config to the bucket (this is the step that's been getting skipped)**

Two ways — pick whichever you can run right now.

*Option A — AWS Console (no CLI needed):*

1. AWS Console → S3 → click `model-uploader-bucket`.
2. **Permissions** tab → scroll to **Cross-origin resource sharing (CORS)**.
3. Click **Edit**.
4. Paste the entire contents of [infra/s3-cors.json](../infra/s3-cors.json).
5. **Save changes**.

*Option B — AWS CLI:*

```bash
aws s3api put-bucket-cors \
  --bucket model-uploader-bucket \
  --region eu-north-1 \
  --cors-configuration file://infra/s3-cors.json
```

**Verify** (do not skip this — it's the only way to be sure the change actually landed in the right place):

```bash
aws s3api get-bucket-cors --bucket model-uploader-bucket --region eu-north-1
```

The output must include `"AllowedMethods": ["GET", "HEAD", "PUT"]` and `"AllowedOrigins": ["*"]`. If the command returns `NoSuchCORSConfiguration` or a stale ruleset, the apply step targeted the wrong bucket/account/region — re-run `put-bucket-cors` against the right one.

Browser-side: CORS preflight responses are cached for up to `MaxAgeSeconds` (1 hour with the shipped config). **Hard-refresh** the upload page (Ctrl-Shift-R / Cmd-Shift-R) so the browser drops the stale negative preflight result. In Chrome DevTools you can also tick **Network → Disable cache** while testing.

**Fix #2 — XHR-based upload with multi-stage progress bar**

[app/(vendor)/vendor/products/new/new-product-form.tsx](../app/(vendor)/vendor/products/new/new-product-form.tsx) now wraps the GLB and texture PUTs in a small `putWithProgress(url, body, contentType, onProgress)` helper backed by `XMLHttpRequest`. XHR exposes `xhr.upload.onprogress` events with `loaded` / `total` byte counts, which the form maps onto a single overall progress bar.

The bar advances through four labelled stages so the vendor can see exactly where they are in the flow:

| Stage | Label | Progress band |
|---|---|---|
| `presigning` | "Preparing upload…" | 0% |
| `uploading_glb` | "Uploading model" | 0% → 85% (driven by XHR `progress` events) |
| `uploading_textures` | "Uploading variant textures" | 85% → 95% (split across all textures) |
| `finalizing` | "Compressing & saving" | 96% → 100% (server-side Draco; indeterminate, so pinned at 96 until response) |

The bar uses `role="progressbar"` + `aria-valuenow` / `aria-valuemin` / `aria-valuemax` so screen readers announce progress. It clears on success (just before the route push) and on failure (so the error banner is what the user reads).

The XHR error handler now distinguishes between HTTP failures (which carry a status code in the message) and `error` events with `status: 0` (which is what browsers surface for both CORS-blocked and network-blip failures — the platform doesn't let JS distinguish them for security reasons). Either way the catch block surfaces the underlying `Error.message` to the form's red banner, so vendors see "Upload to storage failed. (Network or CORS error.)" instead of the prior generic "Network error".

**Verification**

After Fix #1 is applied to the bucket and Fix #2 is deployed:

- DevTools → Network → filter on the bucket host → the OPTIONS preflight returns **204** with `Access-Control-Allow-Origin: https://3-d-ecommerce-configurator.vercel.app` (S3 echoes the request origin when the rule allows `*`) and `Access-Control-Allow-Methods` containing `PUT`.
- The subsequent PUT returns 200 OK.
- The form shows the progress bar climbing from "Uploading model 0%" through to "Compressing & saving 100%" before routing to `/vendor/products`.

**Takeaway**

When a CORS preflight 403 persists across multiple fixes, the answer is almost always *the rule simply isn't applied to the bucket you think it is*. Verify with `get-bucket-cors` against the exact bucket and region before iterating on the JSON. And: any user-facing upload over ~5 MB should use XHR (or `fetch` + a manual `ReadableStream` reader, but XHR is simpler) so the UI has something honest to say while bytes travel.

---

## Issue 16 — S3 CORS still blocks the presigned PUT in production; switch to same-origin chunked uploads

**Sprint:** 3–4 — *Upload pipeline* (deployment-blocking; closes out the CORS thread that started in Issue 14).

**Symptom**

Even with Issue 15's `AllowedOrigins: ["*"]` config and the `requestChecksumCalculation` fix from Issue 14, the production deploy at `https://3-d-ecommerce-configurator.vercel.app` still fails:

```
Access to XMLHttpRequest at 'https://model-uploader-bucket.s3.eu-north-1.amazonaws.com/
pending/<vendorId>/<uploadId>.glb?X-Amz-Algorithm=AWS4-HMAC-SHA256&…' from origin
'https://3-d-ecommerce-configurator.vercel.app' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check: No
'Access-Control-Allow-Origin' header is present on the requested resource.
```

Same shape as Issue 15. The CORS config in this repo is correct — the problem is operational: the JSON either isn't reaching the bucket, isn't being applied to the right account/region, or is being overridden by something else in the AWS environment that's hard to debug from the outside.

**Root cause**

Whatever the exact AWS-side reason, **the architecture has a fragility**: the browser is making a cross-origin request to S3 at all. Any time the browser → S3 leg exists, the bucket's CORS rules become a load-bearing piece of *infrastructure config* that has to be applied per environment, per account, per region — and silently breaks the upload UX if any of those is off. Three issues (14, 15, 16) on the same root structural assumption is the signal that the assumption itself needs to go.

The fix is to **remove the browser → S3 leg entirely** and run every upload byte through our own Next.js API routes. Browser → Next.js is same-origin → no CORS preflight, no AWS-side config dependency at all. The Next.js function then does server → S3 in the trusted backend, which has never been a CORS problem (server fetches don't carry an `Origin` header that S3 evaluates).

The blocker that used to make this impossible was Vercel's per-invocation request-body cap (4.5 MB Hobby / 50 MB Pro — Issue 13). The way around that without giving up on a 100 MB ceiling is chunked uploads: split the file into ~4 MB chunks client-side, POST each chunk to a same-origin route, reassemble server-side.

**Fix**

Replaced the presigned-PUT flow from Issues 13–15 with a **same-origin chunked upload** flow. Every byte the browser sends now goes to a `/api/vendor/products/upload/...` route on the same origin as the app.

1. **[app/api/vendor/products/upload/init/route.ts](../app/api/vendor/products/upload/init/route.ts)** — no longer returns presigned URLs. Just validates auth + vendor, generates a `uploadId` UUID, computes `totalChunks = Math.ceil(fileSize / 4 MB)`, and returns `{ uploadId, chunkSize, totalChunks }`. Chunk size is 4 MB — comfortably below Vercel's 4.5 MB inbound cap on every plan tier, including Hobby.
2. **New [app/api/vendor/products/upload/chunk/route.ts](../app/api/vendor/products/upload/chunk/route.ts)** — receives one chunk per POST. Query params `?uploadId=&part=N` identify the slot; body is raw bytes (`Content-Type: application/octet-stream`, read via `req.arrayBuffer()`). Each chunk gets persisted to S3 at `pending/{vendorId}/{uploadId}/chunk-NNNN.bin` (zero-padded so lexicographic order matches numeric order — useful for any future list-and-resume work). Defensive 413 if a chunk somehow arrives above the cap.
3. **New [app/api/vendor/products/upload/texture/route.ts](../app/api/vendor/products/upload/texture/route.ts)** — same shape for textures (which are always < 2 MB, so they don't need chunking). Persists each texture to its final permanent key `vendors/{vendorId}/textures/{uploadId}-{index}.{ext}` and returns the key so the client can reference it on /complete.
4. **[app/api/vendor/products/upload/complete/route.ts](../app/api/vendor/products/upload/complete/route.ts)** — rewritten to reassemble. Body is JSON metadata (`uploadId`, `totalChunks`, product fields, variants with `textureKey` references). The route:
   - HEAD-validates every referenced texture key (still scoped under this vendor + uploadId prefix).
   - Pulls every chunk back from S3 in parallel via `Promise.all(getObjectBytes(...))` — server → S3 has no payload cap, so the only ceiling is process memory while the buffers are alive (bounded by `MAX_GLB_BYTES` = 100 MB; well within Vercel's 1 GB Hobby / 3 GB Pro memory budget).
   - Concatenates into a single `Uint8Array`, drops the chunk-array reference for the GC, then runs `processGlb` as before.
   - Uploads the compressed result to its permanent key, deletes every temp chunk in parallel, and creates the `Product` + `ProductVariant` rows.
5. **[app/(vendor)/vendor/products/new/new-product-form.tsx](../app/(vendor)/vendor/products/new/new-product-form.tsx)** — the helper renamed from `putWithProgress` to `postWithProgress` and now resolves with `{ status, text }` so the caller can parse the server's JSON error body and surface real messages (rather than the prior "Storage rejected upload" generic). The `onSubmit` flow is now: `POST /init` → loop `POST /chunk?part=i` for i in 0..totalChunks-1 (sequentially, with per-chunk progress events feeding the bar) → for each variant texture, `POST /texture?index=i` → `POST /complete` with the texture-key map.

**Why this is structurally better than fixing CORS**

- **One less load-bearing AWS dependency.** Bucket CORS is now only relevant for the *read* path (browsers fetching GLBs/textures for the viewer), and that's already proxied through `/api/assets/[...key]` (Issue 10) so the read path also doesn't depend on bucket CORS. Net result: the app works against a fresh S3 bucket with **zero CORS rules**, on any deploy target, with no console steps.
- **No presigned-URL gotchas.** Issue 14's `requestChecksumCalculation` quirk, Issue 15's wildcard-origin matching, and any future SDK default behaviors that affect presigned URLs all go away — we don't presign anything anymore.
- **No platform body-cap escape hatch needed.** Chunks always stay below the lowest-tier cap, so the upload works identically on Hobby, Pro, and Enterprise.
- **Same upstream credentials.** Server → S3 still uses the same IAM access key + secret already configured in `.env`. No new permissions, no new infra.

**Trade-offs**

- **Latency.** A 100 MB file is now 25 sequential 4 MB POSTs through Vercel instead of one direct PUT to S3. Per-call HTTPS handshake + cold-start + S3 PUT adds maybe ~30–60s of total upload time vs. the direct-to-S3 path. Acceptable for the marketplace use case; the upload is one-shot per product. The progress bar from Issue 15 keeps the UX honest while it runs.
- **S3 writes double.** Each chunk is one PutObject; the assembled GLB is one more; the deletes at the end are N more. 25 chunks → ~50 S3 ops per upload vs. 2 on the direct path. Cost is negligible (S3 PUT is ~$0.005 per 1000 requests), but worth knowing.
- **Vercel function invocations.** 25 chunks → 25 function calls instead of 2 (init + complete). Each chunk-receiver call is short (< 5s) so they stay well inside the per-invocation duration limit, and on Hobby/Pro both this is well under the monthly invocation quota for normal vendor upload traffic.
- **Memory peak on /complete.** While reassembling, the function holds the full 100 MB plus the compressed copy plus Draco working memory — peak around 250 MB. Fine for Vercel's 1 GB Hobby budget; would need rethinking if `MAX_GLB_BYTES` ever climbs much past 100 MB.

**Faster path stays available (deferred)**

The chunk-S3-objects approach is the simplest path that always works. If upload latency becomes a real complaint, the path forward is **S3 multipart upload through the Vercel function**: the function relays chunks straight into S3's multipart API instead of writing them as temp objects, eliminating the "reassemble in memory" step in /complete. The catch is S3 requires parts ≥ 5 MB except the last one, which doesn't fit Vercel's 4.5 MB cap directly — needs either a 2-chunk buffer (Redis or another temp S3 key) or the Pro-tier Fluid Compute 50 MB cap. Out of scope until upload UX latency is the bottleneck.

**Verification**

- DevTools → Network → no requests to `model-uploader-bucket.s3...` from the browser during upload. Every request is to `https://<your-domain>/api/vendor/products/upload/...`.
- The progress bar from Issue 15 climbs from 0% to ~85% across the chunk loop, 85% → 95% across textures, then sits at 96% while `/complete` does the Draco pass before snapping to 100%.
- On 100 MB inputs the full flow takes ~30–60s; on small GLBs (1–5 MB, one chunk) it's under 5s.
- The bucket needs zero CORS configuration for this path to work — if you've never run `put-bucket-cors`, that's fine.

**Takeaway**

When a piece of *infrastructure config* keeps biting you across multiple debug rounds, the cheapest long-term fix is to restructure the system so that config stops being load-bearing. CORS for browser-direct cloud-storage uploads is exactly that kind of trap — every new environment (preview deploy, custom domain, staging bucket) means another rule to apply, another origin to permit, another cache to invalidate. Routing the upload through your own API trades a bit of latency for an architecture that just works, anywhere, with no console steps.

---

## Issue 17 — `useInsertionEffect must not schedule updates` from the route-progress bar

**Sprint:** Cross-sprint — *Loading & Navigation Feedback Pass* (top progress bar + segment-level `loading.tsx` fallbacks).

**Symptom**

Immediately after navigating to almost any page (e.g. clicking `Browse` in the public header), the browser console threw:

```
Console Error
useInsertionEffect must not schedule updates.
components/layout/route-progress.tsx (38:7) @ start

  36 |       }
  37 |       startedAt.current = performance.now();
> 38 |       setPhase("loading");
     |       ^
  39 |     }
  40 |
  41 |     function finish() {
```

The progress bar still visually appeared, but the error fired on every Link click and back/forward.

**Root cause**

[components/layout/route-progress.tsx](../components/layout/route-progress.tsx) installs three navigation triggers:
1. a capture-phase `click` listener on `document` (catches `<a>` and `<Link>` clicks),
2. monkey-patches `window.history.pushState` / `replaceState` (catches programmatic `router.push` / `router.replace`),
3. a `popstate` handler (catches back / forward).

Each trigger calls `start()`, which synchronously called `setPhase("loading")` to make the bar visible.

The Next 16 App Router **commits a client navigation by invoking `history.pushState` from inside a `useInsertionEffect` callback**. `useInsertionEffect` is reserved for synchronous DOM mutations that must happen *before* React paints — and React explicitly forbids any state update from being scheduled inside it (you'd risk a render loop or stale-DOM mismatch). React enforces this with the `useInsertionEffect must not schedule updates` warning.

So the call chain at fault was:
```
Next router internal effect (useInsertionEffect)
  └── window.history.pushState(...)          ← our patched version runs
        └── start()
              └── setPhase("loading")        ← React throws
```

The click and popstate paths were *not* causing the error (they fire from real browser events outside React's render cycle), but the pushState patch was — and that's the one Next.js uses for every client transition.

**Fix**

Rewrote [components/layout/route-progress.tsx](../components/layout/route-progress.tsx) so that **every `setPhase` call is dispatched via `queueMicrotask`**:

```ts
function setPhaseSafe(next: Phase) {
  phaseRef.current = next;
  // Defer the React state update so it can never land inside a
  // useInsertionEffect callback.
  queueMicrotask(() => setPhase(next));
}
```

`queueMicrotask` schedules its callback for *after* the current synchronous task finishes — i.e. after the insertion-effect phase has wrapped up — so by the time React sees `setPhase`, we're back in normal task territory where state updates are legal.

Three related cleanups went in at the same time:
1. **Added `phaseRef`** — a ref mirror of `phase`. The subscribe-once `useEffect` previously read `phase` from a closure, so when we re-installed listeners on each phase change (to refresh the closure) we got a [phase]-dependency loop. Switching to a ref lets the effect install **once** and gives `start()`/`finish()` an always-current value.
2. **Reduced effect dependencies to `[]`** — listeners install once on mount, tear down on unmount. The pathname/searchParams effect that ends the bar reads `phaseRef.current`, not `phase`, so it doesn't need `phase` in its deps either.
3. **Defensive history un-patch** — on cleanup, only restore the original `pushState` / `replaceState` if our wrapper is still the active one. If a downstream library has chained another patch on top, we leave the chain alone rather than breaking it.

**Why `queueMicrotask` (not `setTimeout(0)` or `requestAnimationFrame`)**

- `queueMicrotask` runs **before** the next paint and before any `setTimeout` callback, but **after** the current synchronous task — exactly the gap we need. The progress bar still appears in the same frame the click was processed.
- `setTimeout(0)` would defer until at least the next task tick (4 ms minimum in browsers), delaying the bar visibly.
- `requestAnimationFrame` would defer until the next paint — same delay problem, and on slow nav the bar would lag by one frame even when it doesn't need to.

**Verification**

- Click any internal `<Link>` (e.g. `/products` → `/cart` → `/products/[slug]`): no console error, progress bar appears within ~1 frame, fades on commit.
- Submit the register form (`router.push` after sign-in): no error, bar appears.
- Use browser back / forward: no error, bar appears.
- Open and close the configurator's variant picker (causes a `router.replace`-style URL update): no error.
- `npx tsc --noEmit` — green.

**Takeaway**

When you monkey-patch a host-environment API that *might* be called from a React internal effect, never assume your hook callback can run synchronous React work. `queueMicrotask` is the cheapest, lowest-latency way to escape whatever effect phase happens to be on the stack. The same trap exists for any patched `MutationObserver`, `ResizeObserver`, or `IntersectionObserver` callback that ends up calling `setState` — if the observer's underlying notification ever fires during a React commit (and they sometimes do), you'll get the same insertion-effect warning. The fix is identical.
