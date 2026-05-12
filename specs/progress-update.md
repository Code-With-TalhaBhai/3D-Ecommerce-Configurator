# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase
- Sprint 5-6 (3D Viewer & Customization) — complete

## Current Goal
- Sprint 7-8 (Marketplace Core: cart, checkout, Stripe) — not started

## Completed

### Sprint 1-2: Foundation

- Feature 01: Package Setup — Installed and pinned: `next-auth@beta` (v5 for Next 16 App Router), `@auth/prisma-adapter`, `@prisma/client` + `@prisma/adapter-pg` (Prisma 7 driver-adapter mode), `@supabase/supabase-js`, `@reduxjs/toolkit` + `react-redux`, `zod`, `bcryptjs`, `react-hook-form` + `@hookform/resolvers`, `clsx`, `tailwind-merge`, `lucide-react`. Dev: `prisma`, `dotenv`, `@types/bcryptjs`. `tsconfig.json` paths kept at `"@/*": ["./*"]` (root-relative, no `src/`).
- Feature 02: Prisma Schema — `prisma/schema.prisma` defines all 8 entities from AGENTS.md §7 (`User`, `Vendor`, `Product`, `ProductVariant`, `Order`, `OrderItem`, `PromoCode`, `Message`) plus NextAuth adapter tables (`Account`, `Session`, `VerificationToken`). Enums: `Role` (ADMIN/VENDOR/CUSTOMER), `ProductStatus` (PENDING/APPROVED/REJECTED), `OrderStatus`, `DiscountType`. Generator outputs to `app/generated/prisma/` (gitignored).
- Feature 03: Database Connection — Supabase Postgres wired through `prisma.config.ts` (uses `DIRECT_URL` for CLI / migrations). Runtime queries use the pooled URL via `@prisma/adapter-pg` in `lib/prisma.ts` (singleton, `globalThis` cached in dev). Initial migration `prisma/migrations/20260511235006_init` applied to remote Supabase (`postgres.izlcfkohtsxwthtpurgi`).
- Feature 04: NextAuth v5 — Split into `auth.config.ts` (edge-safe, imported by `proxy.ts`) and `auth.ts` (Node-only, Prisma + bcrypt). JWT session strategy. Credentials provider validates email+password against `User.passwordHash` via bcrypt. Session augmented with `id` and `role` in JWT/session callbacks; type augmentation in `types/next-auth.d.ts`. Handlers exposed at `app/api/auth/[...nextauth]/route.ts`.
- Feature 05: Auth Pages — `app/(auth)/login` and `app/(auth)/register` route group with shared `layout.tsx` (centered card on `bg-zinc-50`). Register form toggles Customer/Vendor role; on success auto-signs-in and redirects (`/` for customer, `/vendor/onboarding` for vendor). Server actions in `app/(auth)/actions.ts` use `useActionState` + Zod validation with `z.flattenError` for field-level errors. `signOutAction` shared for logout buttons across layouts.
- Feature 06: Vendor Onboarding — `app/(vendor)/vendor/onboarding/page.tsx` redirects vendors with no `Vendor` row through a storefront creation form (store name, description, optional logo URL). Slug is auto-derived from store name, uniqueness enforced via incrementing suffix. Created vendors start with `approvedAt: null` (pending admin approval per AGENTS §3.7). Existing vendors are bounced to `/vendor` dashboard.
- Feature 07: Route Protection — `proxy.ts` at project root (Next 16's renamed middleware) wraps `NextAuth(authConfig).auth` with edge-safe config only (no Prisma/bcrypt imports). The `authorized` callback in `auth.config.ts` gates `/admin` (ADMIN only), `/vendor` (VENDOR or ADMIN), `/account` and `/checkout` (any authenticated user). Public routes pass through. Defense-in-depth: server layouts in `(admin)` and `(vendor)` also call `auth()` and `redirect()`.
- Feature 08: Redux Toolkit Store — `store/index.ts` with `cart` and `viewer` slices. `cart` slice tracks items with quantity, supports addItem / updateQuantity / removeItem / clearCart / hydrate (for cross-session persistence). `viewer` slice tracks live customization state (color, material, textureUrl, variantId) for the 3D configurator. Typed hooks via `useDispatch.withTypes` / `useSelector.withTypes`. `app/providers.tsx` (client component) wraps `SessionProvider` + Redux `Provider`, mounted in `app/layout.tsx`.
- Feature 09: Landing Page — `app/page.tsx` is a server component that calls `auth()` and renders role-aware navigation (sign in/up for guests, vendor/admin console links for authenticated users with the matching role). Hero section + CTA buttons. Tiny UI primitives at `components/ui/{button,input,label}.tsx` use `cn` from `lib/utils.ts`.

### Sprint 3-4: GLB Upload Pipeline

- Feature 10: Storage Abstraction — `lib/storage/index.ts` exports a `StorageDriver` interface (`upload`, `publicUrl`, `remove`). `lib/storage/s3.ts` implements it via `@aws-sdk/client-s3` (singleton `S3Client`, lazy env validation, uses `AWS_CLOUDFRONT_URL` for the returned URL if set, else virtual-hosted S3 URL). Swapping providers is one file change. `server-only` enforced.
- Feature 11: GLB Processing — `lib/glb/process.ts` parses uploaded buffers with `@gltf-transform/core` (`NodeIO` cached via singleton promise), validates magic bytes (`glTF` LE u32), counts triangles across all primitives (indexed and non-indexed paths), rejects files over 50 MB or 100,000 triangles, then runs Draco edgebreaker compression via `@gltf-transform/functions` and `draco3dgltf`. Returns `{ ok, compressed, stats }` discriminated union. Limits exported from `lib/glb/limits.ts`. Custom type declaration for `draco3dgltf` at `types/draco3dgltf.d.ts`.
- Feature 12: Upload API Route — `app/api/vendor/products/upload/route.ts` (Node runtime, `maxDuration: 60`). Auth + role + vendor-exists checks, multipart parsed via `request.formData()` (App Router has no 4 MB body cap), fields validated with Zod, GLB validated and compressed via `processGlb`, S3 key shape `vendors/{vendorId}/products/{slug}-{timestamp}.glb`, Product row created with `status: PENDING` and `polyCount` / `fileSize` populated from the pipeline stats. Slug uniqueness via incrementing suffix loop.
- Feature 13: Vendor Product Upload Page — `app/(vendor)/vendor/products/new` server component gates on vendor existence; client form (`new-product-form.tsx`) is a two-column layout — fields on left, **live client-side R3F preview on right** (blob URL from the picked file, revoked on unmount). Pre-upload guards reject non-`.glb` extensions and files over 50 MB before they hit the network. Submit posts FormData to the upload route, surfaces field errors and server errors, routes to `/vendor/products` and calls `router.refresh()` on success.
- Feature 14: Vendor Product List — `app/(vendor)/vendor/products/page.tsx` lists the current vendor's products in a table with status badge (color-coded per `ProductStatus`), price (Decimal serialized via `.toString()`), stock, triangle count, compressed file size, and upload date. Empty state shown when the vendor has no products yet. Upload CTA links to `/vendor/products/new`.
- Feature 15: Admin Console — `app/(admin)/layout.tsx` enforces ADMIN role (redirect to `/` for any other role). `app/(admin)/admin/page.tsx` overview shows counts (pending/approved/rejected products, vendors, users) with a highlighted card linking to the review queue when pending > 0. `app/(admin)/admin/products/page.tsx` is the review queue with PENDING/APPROVED/REJECTED filter tabs via `searchParams` (Next 16 async Promise). Each `ReviewCard` shows product metadata + a click-to-load 3D preview (dynamic `ssr:false` import of `GlbViewer`) and Approve/Reject server actions in `actions.ts` that revalidate `/admin/products` and `/admin`.
- Feature 16: Reusable GLB Viewer — `components/viewer/glb-viewer.tsx` is a client component wrapping `@react-three/fiber` Canvas with `@react-three/drei`'s `Bounds + Center` (auto-fit), `OrbitControls`, studio `Environment` preset. Accepts a `src` URL (blob or HTTPS) and an optional `revokeOnUnmount` flag for blob lifecycle. Used by both upload preview and admin review.

### Sprint 5-6: 3D Viewer & Customization

- Feature 17: Vendor Variant Write Path — `new-product-form.tsx` adds a dynamic "Variants (optional)" section: vendors can add up to 8 rows, each row a color picker (hex via native `<input type="color">`), free-text material label (max 60 chars), and optional texture image (JPEG/PNG/WebP, max 2 MB each). Variants serialize on submit as `variants` JSON metadata plus separate texture files keyed `texture_0`, `texture_1`, … so they survive FormData's lack of nesting. Pre-upload texture size check blocks files over 2 MB before they hit the network. New constants in `lib/glb/limits.ts`: `MAX_TEXTURE_BYTES`, `MAX_VARIANTS`, `ACCEPTED_TEXTURE_MIME`.
- Feature 18: Upload API Variants — `app/api/vendor/products/upload/route.ts` parses the `variants` JSON with Zod (hex regex on color, max 60 char material, `texture_\d+` key pattern), validates every referenced texture before any storage write (MIME, size, non-empty), then uploads textures under `vendors/{vendorId}/textures/{slug}-{textureKey}-{timestamp}.{ext}`, and creates the matching `ProductVariant` rows in the same Prisma `create` call as the parent product. Texture extension picked from MIME type.
- Feature 19: Public Marketplace Listing — `app/products/page.tsx` is a server component that fetches the 60 most recent APPROVED products with vendor and variant count. Responsive grid (1 / 2 / 3 columns at sm / lg). Each card links to `/products/[slug]`, shows thumbnail (placeholder until thumbnail generation lands), title, store name, price, and variant-count chip. Empty state when there are no live products. SEO metadata at the page level.
- Feature 20: Product Detail Page — `app/products/[slug]/page.tsx` is a server component using Next 16 async params; only APPROVED products are returned (else `notFound()`). `generateMetadata` returns OG title/description/image for SEO. Decimal price serialized via `.toString()` to keep the client payload JSON-safe. Renders the `ProductConfigurator` client island with everything serialized to plain JSON. Back link to `/products`.
- Feature 21: Configurable Viewer — `components/viewer/configurable-viewer.tsx` (dynamically imported `ssr: false`) loads the GLB via `useGLTF`, clones every mesh material on first traversal and snapshots original color and map into a `useRef<Map>` for restore. Subscribes to the `viewer` Redux slice: color changes update each `MeshStandardMaterial.color` reactively; texture URL changes load via `THREE.TextureLoader` (with `colorSpace = SRGBColorSpace`, `flipY = false` for GLTF convention), assign to `material.map`, set `needsUpdate`, and properly dispose on cancel. Null color/texture restores originals so the "Default" chip resets the model.
- Feature 22: Variant Picker & Add-to-Cart — `product-configurator.tsx` (client component) renders a chip-strip variant picker with a swatch dot (background-color from variant.color, background-image from variant.textureUrl when present) and label (material name or color, falling back to "Variant N"). Selecting a chip dispatches `setVariant` to the Redux viewer slice, which the `ConfigurableViewer` consumes. Add-to-Cart button dispatches `cart/addItem` with the current variant ID and surfaces a 1.8s "Added to cart" confirmation. `useEffect` resets viewer state on product mount and unmount so navigation between products doesn't carry stale variants.
- Feature 23: Performance Marker & LOD-Lite — Configurator measures `performance.now()` from mount to the viewer's `onFirstFrame` callback; in development the elapsed ms is printed in a corner overlay and logged. `Navigator.connection.effectiveType` / `saveData` is probed on mount; on slow-2g/2g/3g (or Save Data flag) the configurator shows an amber "Slow connection detected" hint. True multi-LOD generation is deferred until Sprint 7-8+.
- Feature 24: Public Header & Cart Badge — `components/layout/public-header.tsx` (server component, sticky, backdrop-blur) renders on `/products/*` routes via `app/products/layout.tsx`. Shows brand, Browse link, cart icon with item-count badge (`components/layout/cart-badge.tsx` reads from Redux cart), and role-aware right side (sign in / sign up for guests; Vendor/Admin console + sign out for authenticated users). Landing page CTA updated to "Browse products" + secondary action that flips between "Sell on 3D Marketplace" (guest) and "Vendor console" (signed-in).

## In Progress

- None.

## Next Up

### Sprint 7-8: Marketplace Core (per AGENTS.md §3.4, §3.5)
- `/cart` page that reads from the Redux cart slice, supports quantity changes / remove / clear, persists across reloads (localStorage middleware in Redux).
- Cart persistence: localStorage hydrate on app mount, write on every mutation.
- `/checkout` flow (auth-gated) with shipping form, order summary, and promo code field.
- Stripe Checkout Session integration: `POST /api/checkout/session` creates the session, redirects to Stripe; webhook at `/api/stripe/webhook` flips Order to `PAID` and decrements stock.
- Order persistence via `Order` + `OrderItem` rows (model already in schema).
- Promo code application: `PromoCode` lookup, percent or fixed discount.
- Product search and filtering on `/products` (Postgres `ilike` or full-text; vendor / price range / status filters).
- `/account/orders` purchase history (auth-gated).

### Backlog / Not Yet Slotted
- Cart Redux persistence middleware (will arrive with Sprint 7-8).
- `/cart` route — currently the cart badge in `PublicHeader` links to `/cart` but the route doesn't exist yet (404).
- Admin-promotion UI (currently only via SQL `UPDATE "User" SET role = 'ADMIN'`).
- Product thumbnail generation (column exists, not populated; needs headless GL or Puppeteer render pass on upload). Listing currently shows a "3D" placeholder.
- Rejection reason capture on admin reject (currently boolean accept/reject only).
- Vendor product edit / delete flows (currently create-only).
- True LOD: server-side mesh decimation on upload to generate low/medium/high GLB variants, served based on connection class.
- Material-name → property mapping (e.g., "metal" → high metalness). Today the material name is metadata only.
- Supabase Realtime chat (Sprint 9-10).
- E2E tests + accessibility audit (Sprint 11-12).

## Open Questions

- S3 bucket access model — public-read on the `vendors/*` prefix, or signed-URL reads via the storage driver? The viewer fetches `glbUrl` / `textureUrl` directly, so the bucket needs to allow public GET (or CloudFront with OAI). User has not provided AWS creds yet.
- Whether to keep the original (uncompressed) GLB on S3 alongside the Draco-compressed version.
- `next/image` is not wired for product thumbnails yet — we use a plain `<img>` with an ESLint-disable comment because `images.remotePatterns` would need to know the S3/CDN host, which is not configured yet.

## Architecture Decisions

- Next.js 16 + React 19 + Tailwind v4 (CSS-tokens, no `tailwind.config.js`).
- `proxy.ts` (not `middleware.ts`) per Next 16 rename. Edge-safe `auth.config.ts` imported here; Node-only `auth.ts` does Prisma + bcrypt.
- Prisma 7 driver-adapter mode (`@prisma/adapter-pg`) — `PrismaClient` constructor always requires `{ adapter }`. Generated client at `app/generated/prisma/`; import from `@/app/generated/prisma/client` (no `index.ts` in v7).
- `prisma.config.ts` `datasource.url` reads `DIRECT_URL` so migrations bypass pgbouncer; runtime adapter uses pooled `DATABASE_URL`.
- NextAuth v5 split-config pattern: `auth.config.ts` (edge-safe, no Prisma) + `auth.ts` (Node, adds Prisma adapter and Credentials provider). JWT strategy (no DB sessions needed for our use).
- Tiny UI primitives in `components/ui/` (Button/Input/Label) — no shadcn dependency. `cn()` via `clsx + tailwind-merge`.
- Server-side Draco compression — `@gltf-transform/core` + `draco3dgltf`. `NodeIO` and Draco modules cached behind a singleton promise to avoid re-initializing on every request.
- Pluggable storage driver — S3 today, easy swap to Supabase Storage or local FS later via `lib/storage/index.ts` re-export.
- Upload proxied through a Next.js API route (not presigned direct-upload) so server can validate + Draco-compress before persisting.
- All vendor uploads start as `ProductStatus.PENDING`; admin must approve before public listing surfaces them (per AGENTS §3.7).
- Redux Toolkit for client state (cart, viewer config) — per AGENTS §5. RTK Query deferred until we add real API surfaces in Sprint 7-8.
- Variant overrides applied **scene-wide** to all mesh materials. Variants are a single-axis swap (color / material label / texture) rather than per-mesh slot targeting. Per-mesh targeting is a future expansion if vendors ask.
- Material cloning + originals snapshot pattern in `ConfigurableViewer` so we never mutate the `useGLTF`-cached scene (would bleed between viewer instances and across navigations).
- Decimal columns (price) always serialized via `.toString()` before crossing the RSC → client component boundary; `JSON.stringify` of a `Decimal` would throw otherwise.
- `next/image` deliberately not used for product imagery until `images.remotePatterns` is configured for the actual S3/CDN host.

## Session Notes

- Next.js 16.2.6, React 19.2.4, Tailwind v4 (`@tailwindcss/postcss`).
- TypeScript paths kept at `"@/*": ["./*"]` (root-relative) — `lib/`, `store/`, `components/`, `types/`, `auth.ts`, `auth.config.ts`, `proxy.ts` all live at project root.
- Prisma 7.8.0. Migrations directory: `prisma/migrations/`. Run `prisma migrate dev` to add new ones (uses `DIRECT_URL` from `prisma.config.ts`).
- Supabase project `izlcfkohtsxwthtpurgi` (region `ap-northeast-1`). Pooled URL on port 6543 with `pgbouncer=true`; direct URL on 5432. URL-encode any special characters in the password (`@` → `%40`, etc.) when editing `.env`.
- Initial Supabase schema was wiped and re-initialized from `prisma/schema.prisma` cleanly on 2026-05-11 (lost 2 placeholder users + 1 vendor; clean-slate approved by user).
- `@react-three/fiber`, `@react-three/drei`, `three` installed. Viewer components always dynamically imported with `ssr: false` to avoid SSR'ing the WebGL canvas.
- `@aws-sdk/client-s3` v3 used; only the S3 module is imported. `AWS_REGION` / `AWS_S3_BUCKET` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` not yet set in `.env` — upload route will throw at first use until they are.
- `draco3dgltf` ships as JS-only; custom ambient declaration at `types/draco3dgltf.d.ts`.
- To promote a user to ADMIN until we build a UI: `UPDATE "User" SET role = 'ADMIN' WHERE email = '<email>';` in Supabase SQL editor.
- Type-check + `next build` both green as of end of Sprint 5-6. Build output: 14 routes (5 static, 9 dynamic) + proxy middleware. Public additions: `/products` and `/products/[slug]`.
