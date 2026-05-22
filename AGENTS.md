# 3D E-Commerce Configurator


## 1. Project Overview

A web-based multi-vendor e-commerce marketplace where vendors upload interactive 3D models of their products and customers explore, customize, and purchase them directly in the browser — without any plugins.

The platform replaces static 2D product images with real-time 3D interaction (pan, zoom, rotate, texture/color swap), addressing high product-return rates caused by poor pre-purchase visualization.

---

## 2. User Roles

| Role | Responsibilities |
|------|-----------------|
| **Admin** | Platform management, user moderation, 3D model approval queue, analytics |
| **Vendor** | Storefront creation, GLB model upload, product & inventory management, order handling |
| **Customer** | Browse products, interact with 3D models, customize, purchase |

---

## 3. Functional Requirements

### 3.1 Authentication & Authorization

- User registration and login (email/password)
- NextAuth.js with JWT tokens
- Role-based access control: Admin / Vendor / Customer
- Secure session management via Redis

### 3.2 3D Model Upload Pipeline

- Vendors upload GLB / GLTF files directly via the vendor dashboard
- Enforced file size limit (max 100 MB per model)
- Enforced polygon count limit to guarantee render performance
- Server-side Draco compression applied automatically on upload
- Upload validation: format check, corrupt file detection, MIME type verification
- Preview render shown to vendor before publishing
- Models stored on AWS S3, served via CloudFront CDN
- Admin review and approval / rejection queue for uploaded models

### 3.3 3D Viewer & Customization

- Embedded on every product detail page (React Three Fiber)
- Orbit (rotate), pan, and zoom controls
- Real-time texture swapping
- Real-time color and material customization on the live 3D model
- Render time target: under 3 seconds on standard broadband
- Mobile-first responsive — no browser plugins required
- Level of Detail (LOD) support for performance across device tiers
- Supported browsers: all modern browsers (excludes IE, Safari < 15)

### 3.4 Multi-Vendor Marketplace

- Vendor registration and storefront creation
- Product listing management (title, description, price, category, 3D model)
- Inventory control per vendor
- Product search and filtering
- Promo code / discount system
- Customer purchase history

### 3.5 Cart & Checkout

- Add to cart, update quantities, remove items
- Cart persistence across sessions
- Secure checkout flow
- Stripe payment gateway integration
  - Card payments
  - Digital wallet payments (Apple Pay, Google Pay)

### 3.6 Real-Time Chat

- Vendor–customer messaging for pre-purchase queries
- Powered by **Supabase Realtime** (WebSocket-based)
- Chat scoped per product listing (customer ↔ vendor)
- Message history persisted in Supabase database

### 3.7 Admin Dashboard

- User management (view, suspend, delete vendors and customers)
- 3D model review queue (approve / reject uploaded models)
- Content moderation (flag inappropriate or malformed listings)
- Platform analytics and reporting (orders, revenue, active vendors)

---

## 4. Non-Functional Requirements

### 4.1 Performance

- 3D model load time under 3 seconds on standard broadband
- Automatic Draco compression on upload (up to 90% size reduction)
- CloudFront CDN for low-latency GLB delivery globally
- Redis caching for session management
- Next.js App Router with React Server Components for SEO-optimized, fast-loading product pages

### 4.2 Security

- NextAuth.js with JWT and role-based access control
- All payment processing handled by Stripe (PCI-compliant)
- Uploaded file validation to prevent malicious file injection
- HTTPS enforced across all routes
- Environment variables for all secrets (never committed to version control)

### 4.3 Scalability & Reliability

- Stateless API routes (horizontally scalable)
- AWS S3 for durable 3D asset storage
- Supabase for managed PostgreSQL and real-time infrastructure
- Redis for session caching (reduces DB load)

### 4.4 Accessibility & UX

- Mobile-first responsive interface across all pages
- Intuitive 3D configurator controls (orbit, zoom, material swap)
- Accessibility audit completed before final deployment
- No browser plugins or extensions required

---

## 5. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | Next.js (App Router) |
| 3D rendering | React Three Fiber / Three.js |
| 3D asset format | GLB / GLTF |
| 3D compression | Draco (Google) |
| State management | Redux Toolkit + RTK Query |
| Styling | Tailwind CSS |
| Backend | Next.js API routes + Server Actions |
| Database | Supabase (PostgreSQL) |
| Real-time chat | Supabase Realtime |
| ORM | Prisma |
| Auth | NextAuth.js (JWT, RBAC) |
| Session cache | Redis |
| File storage | AWS S3 + CloudFront CDN |
| Payments | Stripe |
| CI/CD | GitHub Actions |
| Deployment | Vercel |

---

## 6. System Architecture

```
Browser (Next.js App Router)
  ├── React Server Components  →  SEO product pages, listings
  └── Client Components
        ├── Redux Store (RTK)   →  cart, auth session, viewer variant, chat state, notifications
        └── React Three Fiber  →  3D viewer, customization

Next.js API Routes / Server Actions
  ├── Auth (NextAuth.js + JWT)
  ├── Product & order management
  ├── GLB upload → S3 + Draco compression
  └── Stripe checkout

Supabase
  ├── PostgreSQL  →  users, products, orders, messages
  └── Realtime    →  vendor–customer chat (WebSockets)

Redis             →  session caching
AWS S3            →  GLB asset storage
CloudFront CDN    →  GLB delivery to browser
Stripe            →  payment processing
```

---

## 7. Database Schema (Key Entities)

| Entity | Key Fields |
|--------|-----------|
| `User` | id, email, password_hash, role (admin/vendor/customer), created_at |
| `Vendor` | id, user_id, store_name, description, logo_url |
| `Product` | id, vendor_id, title, description, price, stock, glb_url, status (pending/approved/rejected) |
| `ProductVariant` | id, product_id, color, material, texture_url |
| `Order` | id, customer_id, total, status, created_at |
| `OrderItem` | id, order_id, product_id, quantity, unit_price |
| `PromoCode` | id, code, discount_type, discount_value, expires_at |
| `Message` | id, product_id, sender_id, receiver_id, body, created_at |

---

## 8. Sprint Plan

| Sprint | Focus | Key Deliverables |
|--------|-------|-----------------|
| 1–2 | Foundation | Next.js scaffold, DB schema, auth system, vendor onboarding flow |
| 3–4 | Upload pipeline | GLB upload UI, server-side validation, Draco compression, S3 storage, admin review queue |
| 5–6 | 3D viewer | React Three Fiber viewer, orbit controls, texture/color swap, mobile responsiveness |
| 7–8 | Marketplace core | Product listings, cart, checkout, Stripe payment integration |
| 9–10 | Advanced features | Supabase Realtime chat, promo codes, search & filtering, purchase history |
| 11–12 | Testing & polish | E2E tests, performance benchmarking, accessibility audit, deployment |

---

## 9. Out of Scope (This Phase)

- AI-based 3D model generation (e.g. Tripo AI)
- Native iOS / Android applications
- Augmented Reality "place in room" feature
- Physical logistics or last-mile delivery integration
- Legacy browser support (Internet Explorer, Safari < 15)

---

## 10. Key Constraints & Assumptions

- Vendors are responsible for the quality of their own 3D models
- GLB is the only accepted 3D file format
- Platform is web-only in this phase
- Real-time chat uses Supabase Realtime — no separate WebSocket server needed
- Draco compression is applied server-side automatically; vendors upload uncompressed files
- Admin approval is required before a product with a 3D model goes live

---

## 11. References

1. Shopify Inc. (2023). *Commerce Trends 2023*. https://www.shopify.com/research/future-of-commerce  
2. Statista (2023). *E-commerce return rate worldwide*. https://www.statista.com/statistics/701906/global-fashion-ecommerce-return-rate/  
3. PwC (2022). *Global Consumer Insights Pulse Survey*. https://www.pwc.com/gx/en/industries/consumer-markets/consumer-insights-survey.html  
4. Khronos Group (2022). *GLTF 2.0 Specification*. https://www.khronos.org/registry/glTF/specs/2.0/glTF-2.0.html  
5. Google (2023). *Draco 3D Data Compression*. https://github.com/google/draco  
6. Three.js Documentation. https://threejs.org/docs/  
7. React Three Fiber Documentation. https://docs.pmnd.rs/react-three-fiber  
8. Next.js Documentation. https://nextjs.org/docs  
9. Supabase Documentation. https://supabase.com/docs
10. Redux Toolkit Documentation. https://redux-toolkit.js.org