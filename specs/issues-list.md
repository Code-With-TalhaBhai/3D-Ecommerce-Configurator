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
