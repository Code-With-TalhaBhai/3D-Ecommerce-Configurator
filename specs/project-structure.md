# Project Structure

> A map of every directory and file that runs in production, and how a single user request flows through them. Pair with [AGENTS.md](../AGENTS.md) for the *what* and [progress-update.md](./progress-update.md) for the *when*.

## Stack at a glance

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2 (App Router) + React 19.2 |
| Styling | Tailwind v4 (CSS-tokens, no `tailwind.config.js`) |
| 3D | React Three Fiber 9 + drei 10 + three 0.184 |
| Asset compression | `@gltf-transform/core` + `draco3dgltf` (server-side Draco) |
| Auth | NextAuth v5 (JWT, Credentials provider) |
| DB | Supabase Postgres via Prisma 7 driver-adapter (`@prisma/adapter-pg`) |
| State | Redux Toolkit (cart + viewer) |
| Storage | AWS S3 (+ optional CloudFront) behind a same-origin proxy |
| Payments | Stripe-hosted Checkout (redirect flow) |
| Realtime chat | Supabase Realtime broadcast |

Path alias: `"@/*": ["./*"]` — every import is root-relative.

---

## Top-level tree

```
final-year-project/
├── app/                       ← Next.js App Router (routes, layouts, API, RSC)
├── components/                ← Reusable React components (UI primitives, viewers, chat)
├── lib/                       ← Server- and shared utilities (Prisma, storage, GLB, auth helpers)
├── store/                     ← Redux Toolkit store + slices + persistence
├── types/                     ← Ambient TypeScript declarations
├── prisma/                    ← schema.prisma + migrations
├── public/                    ← Static assets served at /
├── infra/                     ← S3 CORS JSON (manual ops artifact)
├── specs/                     ← Project docs (this file, AGENTS, progress, issues, PHR)
├── auth.ts                    ← NextAuth v5 — Node-side (Prisma + bcrypt)
├── auth.config.ts             ← NextAuth v5 — edge-safe config (used by proxy.ts)
├── proxy.ts                   ← Next 16's renamed middleware (edge auth gate)
├── prisma.config.ts           ← Prisma CLI config (datasource override for migrations)
├── next.config.ts             ← Turbopack root + server-external Draco packages
├── tsconfig.json              ← Strict TS, "@/*" path alias
├── postcss.config.mjs         ← Tailwind v4 PostCSS plugin
├── eslint.config.mjs          ← Next.js flat config
├── package.json               ← Pinned deps
├── AGENTS.md                  ← Functional spec / requirements
├── CLAUDE.md                  ← Imports AGENTS.md + progress-update.md for AI context
└── .env / .env.example        ← Secrets (DATABASE_URL, AWS, Stripe, Supabase, NEXTAUTH_*)
```

---

## `app/` — App Router

Route groups (`(name)`) don't appear in URLs but scope layouts. Public-facing under `/products`, `/cart`, `/checkout`, `/account`. Authenticated UIs in `(vendor)` and `(admin)`.

### Root layout & global wiring
- `layout.tsx` — Root layout. Loads Geist (sans + mono) from `next/font/google`, wraps everything in `<Providers>`.
- `providers.tsx` — Client island. Mounts `SessionProvider` (NextAuth) + `ReduxProvider`, hydrates cart from localStorage and subscribes to writes. Also mounts `<RouteProgress>` inside a `<Suspense>` boundary (needed because RouteProgress calls `useSearchParams`).
- `globals.css` — Tailwind v4 import, CSS tokens (background/foreground/muted/border/card/ring, light + dark), font-feature-settings for Geist alternates, custom thin scrollbar, `.bg-grid-fade` utility, and three loader keyframes (`shimmer`, `loader-dot`, `route-progress`).
- `page.tsx` — Landing page. RSC; renders role-aware nav, gradient-text H1 hero with trust strip, 6-card feature grid, CTA band, footer.
- `loading.tsx` — Root-level Suspense fallback. Renders `<PageLoader variant="fullscreen">` when a navigation has no deeper loading.tsx to cover it.

### Auth route group `(auth)/`
- `layout.tsx` — Centered translucent card with grid-fade backdrop; brand link.
- `loading.tsx` — `<PageLoader>` ("Securing your session"). Covers all `/login` and `/register` segment transitions.
- `actions.ts` — Server actions: `signInAction`, `signUpAction`, `signOutAction`.
- `login/page.tsx` + `login-form.tsx` — Login form (Credentials).
- `register/page.tsx` + `register-form.tsx` — Register form; toggles Customer/Vendor; auto-signs-in on success.

### Public marketplace
- `products/layout.tsx` — Wraps `/products` with `<PublicHeader>`.
- `products/page.tsx` — RSC. Lists 60 most-recent APPROVED products; supports `?q=`, `?min=`, `?max=` filters; renders cards with the lazy GLB thumbnail.
- `products/loading.tsx` — Skeleton mirroring the listings grid (header block, search bar, 8 card skeletons in the same responsive grid as the live page).
- `products/search-bar.tsx` — Client controlled form that pushes filter querystring.
- `products/[slug]/page.tsx` — RSC product detail. Loads APPROVED product (else `notFound()`), generates OG metadata, mounts `<ProductConfigurator>` + optional `<ProductChatPanel>` (when viewer is signed in and isn't the vendor).
- `products/[slug]/loading.tsx` — Skeleton mirroring `ProductConfigurator`'s 2-column split — viewer pane, vendor/title/price column, variant chips, controls block, CTA.
- `products/[slug]/product-configurator.tsx` — Client island. Sticky 3D viewer (left) + scrolling aside (right) with title/price/stock pill, variant chips, controls panel, add-to-cart, description, stats ribbon.

### Cart, checkout, account
- `cart/layout.tsx` — `<PublicHeader>` wrapper.
- `cart/page.tsx` — RSC shell that mounts `<CartView>`.
- `cart/loading.tsx` — Skeleton with 3 line items + sticky order-summary placeholder.
- `cart/cart-view.tsx` — Client island. Reads Redux cart, quantity steppers, per-row remove, clear-cart confirm, order summary.
- `checkout/layout.tsx` — Defense-in-depth `auth()` check + `<PublicHeader>`.
- `checkout/page.tsx` + `checkout-client.tsx` — Order summary, promo input, POST to session API, redirect to Stripe.
- `checkout/loading.tsx` — `<PageLoader>` ("Preparing checkout / Validating your cart").
- `checkout/success/page.tsx` + `cart-clearer.tsx` — Looks up Order by `stripeSessionId`, renders line items, clears the Redux cart once on mount.
- `checkout/success/loading.tsx` — `<PageLoader>` ("Finalising your order / Confirming the payment with our processor").
- `checkout/cancel/page.tsx` — Friendly "no charge made" landing.
- `account/layout.tsx` — Auth gate + `<PublicHeader>`.
- `account/orders/page.tsx` — Customer purchase history.
- `account/orders/loading.tsx` — Skeleton with 3 order-card placeholders matching the live cards' header + line-item + footer rhythm.

### Vendor route group `(vendor)/`
- `layout.tsx` — Auth + role gate (VENDOR or ADMIN); glass sticky header with logo + pill nav.
- `vendor/loading.tsx` — Inherited by every `/vendor/*` segment. 3-tile stat row + content-card with 4 row placeholders.
- `vendor/page.tsx` — Dashboard (store name, stat tiles, manage-catalog card / empty-state CTA).
- `vendor/onboarding/page.tsx` + `onboarding-form.tsx` + `actions.ts` — Storefront creation form for users without a Vendor row.
- `vendor/products/page.tsx` — Per-row card list of vendor's products with status badge, rejection reason callout, inline `<ProductActions>` delete.
- `vendor/products/actions.ts` — `deleteProduct` server action.
- `vendor/products/product-actions.tsx` — Client delete button with two-tap confirm.
- `vendor/products/new/page.tsx` + `new-product-form.tsx` — Two-column upload form (fields + live R3F preview); variants section; pre-upload guards.
- `vendor/messages/page.tsx` + `vendor-thread.tsx` — Inbox grouping latest 500 messages by `(productId, customerId)`; lazy-loaded threads with realtime reply box.

### Admin route group `(admin)/`
- `layout.tsx` — ADMIN-only gate; glass header with `Overview · Products · Vendors · Users · Orders · Promos` pill nav (overflow row on mobile).
- `admin/loading.tsx` — Inherited by every `/admin/*` segment. 4-tile stat row + content-card with 5 row placeholders.
- `admin/page.tsx` — Overview: 4 big-stat tiles, 3 small-stat groups, recent-orders panel, operational-alerts sidebar.
- `admin/products/page.tsx` + `review-card.tsx` + `actions.ts` — Pending/Approved/Rejected review queue with inline 3D preview and reject-with-reason flow.
- `admin/users/page.tsx` + `user-row.tsx` + `actions.ts` — Filter tabs + search; role/suspend/delete per row with last-admin safety rails.
- `admin/vendors/page.tsx` + `actions.ts` — Approve / revoke approval as a trust badge.
- `admin/orders/page.tsx` — Platform-wide read-only order list.
- `admin/promos/page.tsx` + `promo-form.tsx` + `actions.ts` — Create / expire / delete promo codes.

### API routes `app/api/`
All run on the Node runtime unless noted.

- `auth/[...nextauth]/route.ts` — Re-exports NextAuth handlers (`GET`/`POST`).
- `assets/[...key]/route.ts` — Same-origin asset proxy. Streams S3/CloudFront → browser so the browser never makes a cross-origin request (sidesteps CORS while CloudFront isn't policy-configured). `maxDuration: 60`.
- `vendor/products/upload/route.ts` — Vendor GLB + variant texture upload. Multipart parse, Zod validation, Draco compression via `processGlb`, S3 upload, creates `Product` with `status: PENDING` + `ProductVariant` rows. `maxDuration: 60`.
- `checkout/session/route.ts` — `POST` validates cart, creates `Order` in PENDING with stripeSessionId, opens Stripe Checkout Session (with optional one-shot coupon when promo applies).
- `stripe/webhook/route.ts` — `POST` verifies Stripe signature on raw body. On `checkout.session.completed` / `async_payment_succeeded` → flips Order to PAID and decrements stock atomically; idempotent.
- `products/[id]/messages/route.ts` — `GET` returns the thread; `POST` persists + broadcasts. Vendor-initiated DMs only allowed when the customer has previously messaged or ordered.

### Prisma generated client `app/generated/prisma/`
Output target for Prisma 7's generator (gitignored on `client/`, `internal/`, etc.). Import the client from `@/app/generated/prisma/client`; types from `@/app/generated/prisma/models` or `@/app/generated/prisma/enums`. Models exist as one file per entity: `User`, `Account`, `Session`, `VerificationToken`, `Vendor`, `Product`, `ProductVariant`, `Order`, `OrderItem`, `PromoCode`, `Message`.

---

## `components/`

```
components/
├── ui/                ← Tiny primitives (no shadcn)
│   ├── button.tsx     ← Variants: primary / secondary / outline / ghost / destructive. Sizes: sm / md / lg / icon
│   ├── input.tsx      ← rounded-lg, soft shadow, two-layer focus ring
│   ├── label.tsx      ← 13px, tight tracking
│   ├── spinner.tsx    ← CSS ring spinner (xs / sm / md / lg / xl); inherits text color; motion-reduce safe
│   ├── skeleton.tsx   ← Block placeholder with left-to-right shimmer (@keyframes shimmer); aria-hidden
│   └── page-loader.tsx ← Brand-glyph + rotating ring + animated dots; variant="fullscreen" | "section"
├── layout/
│   ├── public-header.tsx   ← Sticky glass header, logo glyph, pill nav, cart badge, role-aware right side
│   ├── cart-badge.tsx      ← Client; reads cart count from Redux; 99+ cap with ring halo
│   └── route-progress.tsx  ← Client; top 2px progress bar. Anchor-click capture + patched history.pushState/replaceState + popstate; fades on pathname/searchParams change
├── viewer/
│   ├── glb-viewer.tsx          ← Plain R3F canvas + Bounds + OrbitControls. Used by upload preview & admin review
│   ├── glb-thumb.tsx           ← Low-power, demand-frameloop thumbnail renderer for product cards
│   ├── glb-thumb-lazy.tsx      ← dynamic({ ssr:false }) wrapper around GlbThumb with Box-icon placeholder
│   ├── configurable-viewer.tsx ← Customer viewer: upgrades materials to MeshPhysicalMaterial, applies color / finish / lighting / texture / backdrop / autorotate from the viewer slice, exposes a screenshot closure
│   └── controls-panel.tsx      ← Sectioned panel (Color / Finish / Lighting / Backdrop / Spin / Save snapshot), dispatches patchViewer
└── chat/
    └── product-chat-panel.tsx  ← Initial fetch + Supabase Realtime subscribe; deduped bubbles; textarea send (Enter to send)
```

All viewer/chat components are `"use client"`. The R3F viewers are always dynamically imported with `ssr: false` from the pages that mount them (avoids SSR'ing WebGL).

---

## `lib/` — Server- and shared utilities

```
lib/
├── prisma.ts            ← PrismaClient singleton wired through @prisma/adapter-pg; globalThis cache in dev
├── utils.ts             ← cn(...inputs) — clsx + tailwind-merge
├── admin.ts             ← requireAdmin() + adminCount() — used by every admin server action
├── stripe.ts            ← Lazy getStripe() + getStripeWebhookSecret() (don't init at build time)
├── cart-validation.ts   ← validateCart() re-fetches DB & rebuilds server-trusted lines; resolvePromoCode()
├── messages.ts          ← fetchThread() + sendChatMessage() (with broadcast fan-out)
├── realtime.ts          ← Server: broadcastChatMessage() (subscribe, send, teardown, swallow errors)
├── realtime-shared.ts   ← Client-safe constants: CHAT_BROADCAST_EVENT, chatChannelName()
├── glb/
│   ├── limits.ts        ← MAX_GLB_BYTES (100 MB), MAX_TRIANGLES (2M), MAX_TEXTURE_BYTES, MAX_VARIANTS, GLB_MAGIC
│   └── process.ts       ← NodeIO (cached) + Draco encoder; magic-byte check, triangle count, compression
├── storage/
│   ├── index.ts         ← StorageDriver interface; re-exports the chosen driver (s3Storage today)
│   ├── s3.ts            ← @aws-sdk/client-s3 implementation; lazy env validation; returns CloudFront URL if AWS_CLOUDFRONT_URL is set, else virtual-hosted S3 URL
│   └── cdn.ts           ← toCdnUrl() — by default rewrites to /api/assets/<key> (same-origin proxy); bypasses proxy when ASSET_PROXY=false
└── supabase/
    ├── client.ts        ← getSupabase() — lazy public client for browser realtime
    └── admin.ts         ← (server-only) service-role client if/when needed
```

`server-only` is imported in every file that must never end up in a client bundle (`prisma.ts`, `stripe.ts`, `admin.ts`, `cart-validation.ts`, `messages.ts`, `realtime.ts`, `glb/*`, `storage/*`).

---

## `store/` — Redux Toolkit

```
store/
├── index.ts              ← makeStore() — registers cart + viewer reducers; exports AppStore / RootState / AppDispatch
├── hooks.ts              ← Typed useAppDispatch / useAppSelector via .withTypes
├── persistence.ts        ← hydrateCartFromStorage(store) + subscribeCartToStorage(store); key "3dmkt:cart:v1"; Zod-validated payload
└── slices/
    ├── cartSlice.ts      ← addItem / updateQuantity / removeItem / clearCart / hydrate
    └── viewerSlice.ts    ← variantId + color/textureUrl/material/finish/lighting/backgroundColor/autoRotate; setVariant / patchViewer / resetVariant / resetTuning
```

The store is created **per request** on the client (in `app/providers.tsx`) and never on the server. Persistence runs in `useEffect` so it never touches SSR.

---

## `types/`

```
types/
├── next-auth.d.ts     ← Augments Session.user / JWT with id + role
└── draco3dgltf.d.ts   ← Ambient declaration (draco3dgltf ships JS-only without types)
```

---

## `prisma/`

```
prisma/
├── schema.prisma                                          ← 11 models + 4 enums
└── migrations/
    ├── migration_lock.toml
    ├── 20260511235006_init/migration.sql                  ← Initial schema
    ├── 20260512000000_add_order_stripe_fields/            ← subtotal, discountAmount, promoCode, stripeSessionId
    ├── 20260512010000_add_user_suspended_at/              ← User.suspendedAt
    └── 20260512020000_add_product_rejection_reason/       ← Product.rejectionReason
```

Models: `User` · `Account` · `Session` · `VerificationToken` · `Vendor` · `Product` · `ProductVariant` · `Order` · `OrderItem` · `PromoCode` · `Message`.
Enums: `Role` (ADMIN / VENDOR / CUSTOMER) · `ProductStatus` (PENDING / APPROVED / REJECTED) · `OrderStatus` (PENDING / PAID / SHIPPED / DELIVERED / CANCELLED / REFUNDED) · `DiscountType` (PERCENT / FIXED).

`prisma.config.ts` overrides `datasource.url` to `DIRECT_URL` for CLI/migrations so Prisma bypasses pgbouncer. Runtime uses the pooled `DATABASE_URL` via the driver adapter.

---

## Root-level config & auth files

- `auth.ts` — Node-side NextAuth init. Adds the Prisma adapter + Credentials provider (bcrypt-verified, suspended-user blocked). Exports `{ handlers, auth, signIn, signOut }`.
- `auth.config.ts` — Edge-safe config (no Prisma, no bcrypt) imported by `proxy.ts` and merged into `auth.ts`. Holds JWT/session callbacks and the `authorized` route gate (`/admin` → ADMIN, `/vendor` → VENDOR|ADMIN, `/account` & `/checkout` → authenticated).
- `proxy.ts` — Next 16's renamed middleware. Runs on every non-API request; defers to the edge-safe NextAuth callback.
- `next.config.ts` — Turbopack root override; marks `draco3dgltf` + `@gltf-transform/core` as server-external so Webpack/Turbopack don't rewrite the WASM `fs.readFileSync` path.
- `prisma.config.ts` — Prisma CLI config (datasource URL override).
- `postcss.config.mjs` — Tailwind v4 PostCSS plugin (`@tailwindcss/postcss`).
- `eslint.config.mjs` — Next.js + TypeScript flat config.
- `tsconfig.json` — Strict; `"@/*": ["./*"]`; includes both `.next/types/**/*.ts` and `.next/dev/types/**/*.ts`.

---

## `infra/` and `public/`

- `infra/s3-cors.json` — CORS document to attach to the S3 bucket (manual ops; relevant when the proxy is bypassed via `ASSET_PROXY=false`).
- `public/` — Static SVGs (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`); placeholders kept from `create-next-app`.

---

## `specs/`

- `AGENTS.md` (project root) — Functional spec.
- `progress-update.md` — Feature-by-feature progress log (Sprints 1–10 + UI polish passes).
- `project-structure.md` (this file) — Structural map.
- `issues-list.md` — Tracked issues (e.g. S3/CloudFront CORS posture).
- `phr.md` — Project-history record / decisions log.

---

## Request flow examples

### 1. Customer browses and buys a product

```
Browser  GET /products/[slug]
  │
  ▼
proxy.ts       (edge — public route, passes through)
  │
  ▼
app/products/[slug]/page.tsx       (RSC: prisma.product.findFirst, toCdnUrl on glbUrl/thumbnail)
  │
  ▼
<ProductConfigurator />            (client island)
  ├── <ConfigurableViewer src={/api/assets/...glb} />   (dynamic, ssr:false)
  │      └── /api/assets/[...key]/route.ts → storage.publicUrl → CloudFront/S3 → stream back
  ├── <ControlsPanel />             (dispatches patchViewer → live material updates)
  └── Add-to-Cart  → dispatch addItem  → persistence subscribe writes localStorage
                                       └── <CartBadge> re-renders the count

Browser  GET /cart  →  <CartView> reads Redux items
Browser  GET /checkout  →  <CheckoutClient>
  └── POST /api/checkout/session       (validateCart → creates Order PENDING → Stripe Checkout Session → updates Order.stripeSessionId)
  → 303 to Stripe-hosted page

Stripe → POST /api/stripe/webhook
  └── verify raw body signature → transaction: Order.status = PAID, decrement each Product.stock (idempotent)
```

### 2. Vendor uploads a 3D product

```
/vendor/products/new (client form)  →  POST /api/vendor/products/upload (multipart)
  ├── auth() + role check + vendor-exists check
  ├── Zod parse fields (+ variants JSON)
  ├── processGlb(buffer):
  │     – magic-byte check
  │     – triangle count vs MAX_TRIANGLES
  │     – Draco encode (NodeIO + draco3dgltf, both cached singletons)
  ├── storage.upload({ key: vendors/{vendorId}/products/{slug}-{ts}.glb })
  ├── for each variant texture → MIME/size/non-empty check → storage.upload
  └── prisma.product.create({ status: PENDING, ...variants })
```

### 3. Admin reviews & approves

```
/admin/products?status=PENDING       (RSC: prisma.product.findMany)
  └── <ReviewCard>                    (click-to-load GlbViewer; Approve / Reject UI)
       └── server action approve() or reject(formData)   →  requireAdmin()
            └── prisma.product.update + revalidatePath('/admin/products')
```

### 4. Customer ↔ vendor chat

```
/products/[slug] mounts <ProductChatPanel>
  ├── GET /api/products/[id]/messages   (lib/messages.fetchThread)
  └── supabase.channel(chatChannelName(productId, currentUserId, vendorUserId)).subscribe()

User sends:
  POST /api/products/[id]/messages       →  sendChatMessage()
  ├── prisma.message.create
  └── broadcastChatMessage(channel, message)   ← fire-and-forget; persisted row is source of truth
```

### 5. Navigation loading feedback

```
User clicks <Link href="/products">
  │
  ├── <RouteProgress> capture-phase click handler   →  setPhase("loading")
  │     └── Top 2-px bar animates scaleX(0 → 0.96) over 1.4s
  │
  ▼
Next.js suspends on the new segment
  └── app/products/loading.tsx renders the grid skeleton
        (<PublicHeader> from layout stays mounted above)

Segment commits  →  usePathname / useSearchParams updates
  └── <RouteProgress> useEffect →  setPhase("finishing")
        └── 220-ms fade out → setPhase("idle")  →  bar unmounts
```

---

## Conventions you'll see repeated

- **Server vs client boundary**: server-only files have `import "server-only"` at the top. Client components start with `"use client"`. R3F viewers are always `dynamic(..., { ssr: false })`.
- **Decimal serialisation**: every `Decimal` (price, totals) is converted via `.toString()` before crossing the RSC → client boundary; raw `Decimal` instances would throw in `JSON.stringify`.
- **Async params**: Next 16 ships `params` and `searchParams` as `Promise<...>` — always `await` them at the top of the route.
- **Asset URLs**: never hand a raw S3/CloudFront URL to the browser. Always run it through `toCdnUrl()` so the same-origin proxy can wrap it.
- **Cart line keys**: `(productId, variantId)` together. The cart never carries finish/lighting/colour overrides — only the vendor variant survives into the order.
- **Admin safety**: any admin write action calls `requireAdmin()` first; mutations against users also check `adminCount()` to refuse self-lockout or last-admin demotion.
- **Stripe orders**: `Order` is created **before** the Stripe session (PENDING, `stripeSessionId` patched in immediately after) so the webhook always has a row to flip.
- **Promo codes**: always uppercased on lookup and on insert (`/admin/promos` already uppercases on create).
- **Cart persistence key**: `3dmkt:cart:v1` (versioned, so a future schema bump can wipe and rehydrate cleanly).
- **Loading feedback is two-layered**: every navigable segment gets a `loading.tsx` (segment-level Suspense fallback — skeleton when chrome is preserved, `<PageLoader>` when the page replaces full-screen) **and** the globally mounted `<RouteProgress>` fires the moment a same-origin link is clicked (covers Links, `router.push`/`router.replace`, and back/forward). Re-use `Spinner` for in-button waits, `Skeleton` for inline placeholders, `PageLoader` for full-screen / full-section waits.
