import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { toCdnUrl } from "@/lib/storage/cdn";
import { GlbThumbLazy } from "@/components/viewer/glb-thumb-lazy";
import { SearchBar } from "./search-bar";
import type { Prisma } from "@/app/generated/prisma/client";

export const metadata = {
  title: "Browse products",
  description: "Browse 3D-configurable products. Rotate, zoom, and customize before you buy.",
};

type Params = Promise<{
  q?: string;
  min?: string;
  max?: string;
}>;

function parsePrice(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Public listing pulls only APPROVED products (per AGENTS §3.7).
export default async function ProductsPage({ searchParams }: { searchParams: Params }) {
  const { q, min, max } = await searchParams;
  const minPrice = parsePrice(min);
  const maxPrice = parsePrice(max);

  const where: Prisma.ProductWhereInput = { status: "APPROVED" };
  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
    ];
  }
  if (minPrice !== null || maxPrice !== null) {
    where.price = {
      ...(minPrice !== null ? { gte: minPrice } : {}),
      ...(maxPrice !== null ? { lte: maxPrice } : {}),
    };
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      vendor: { select: { storeName: true, slug: true } },
      _count: { select: { variants: true } },
    },
  });

  const hasFilters = Boolean(q || min || max);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Marketplace
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Every product is configurable in real-time 3D.
        </p>
      </header>

      <div className="mb-6">
        <SearchBar />
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {hasFilters
              ? "No products match those filters yet."
              : "No products are live yet. Check back soon."}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
            {products.length} result{products.length === 1 ? "" : "s"}
          </p>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/products/${p.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
                >
                  <div className="aspect-[4/3] bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-950">
                    {p.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={toCdnUrl(p.thumbnailUrl)!}
                        alt={p.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : p.glbUrl ? (
                      <GlbThumbLazy
                        src={toCdnUrl(p.glbUrl)!}
                        className="h-full w-full"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-wider text-zinc-400">
                        3D
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <h2 className="line-clamp-1 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                      {p.title}
                    </h2>
                    <p className="line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                      by {p.vendor.storeName}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                        ${p.price.toString()}
                      </span>
                      {p._count.variants > 0 && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {p._count.variants} variant{p._count.variants === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
