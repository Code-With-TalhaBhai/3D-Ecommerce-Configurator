import Link from "next/link";
import { PackageOpen, SearchX } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { toCdnUrl } from "@/lib/storage/cdn";
import { ProductThumb } from "@/components/viewer/product-thumb";
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
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-8 flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
          Marketplace
        </span>
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-zinc-900 sm:text-4xl dark:text-zinc-50">
          Discover 3D-configurable products
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Every product on the marketplace can be rotated, customised and previewed before you buy — straight in the browser.
        </p>
      </header>

      <div className="mb-8">
        <SearchBar />
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-16 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {hasFilters ? <SearchX className="h-5 w-5" /> : <PackageOpen className="h-5 w-5" />}
          </span>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {hasFilters ? "No matches for those filters" : "No products live yet"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            {hasFilters
              ? "Try widening your price range or clearing the search term."
              : "New 3D-configurable items will appear here as vendors publish them."}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-5 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {products.length} result{products.length === 1 ? "" : "s"}
          </p>
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/products/${p.slug}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm shadow-zinc-900/[0.03] transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg hover:shadow-zinc-900/[0.06] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80"
                >
                  <div className="relative aspect-[4/3]">
                    <ProductThumb
                      src={toCdnUrl(p.thumbnailUrl)}
                      alt={p.title}
                      className="h-full w-full"
                      imgClassName="group-hover:scale-[1.03]"
                    />
                    {p._count.variants > 0 && (
                      <span className="absolute right-3 top-3 inline-flex items-center rounded-full border border-zinc-200/80 bg-white/90 px-2 py-0.5 text-[10px] font-medium tracking-tight text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:text-zinc-300">
                        {p._count.variants} variant{p._count.variants === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {p.vendor.storeName}
                    </p>
                    <h2 className="line-clamp-1 text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                      {p.title}
                    </h2>
                    <div className="mt-auto flex items-end justify-between pt-3">
                      <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                        ${p.price.toString()}
                      </span>
                      <span className="text-[11px] font-medium text-zinc-400 transition-colors group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-300">
                        View →
                      </span>
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
