import { prisma } from "@/lib/prisma";
import { toCdnUrl } from "@/lib/storage/cdn";
import { ReviewCard } from "./review-card";

export const metadata = { title: "Product review queue" };

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status === "approved" ? "APPROVED" : status === "rejected" ? "REJECTED" : "PENDING";

  const products = await prisma.product.findMany({
    where: { status: filter },
    orderBy: { createdAt: "asc" },
    include: { vendor: { select: { storeName: true, slug: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Product review queue
        </h1>
        <FilterTabs current={filter} />
      </div>

      {products.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nothing in the {filter.toLowerCase()} bucket.
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 lg:grid-cols-2">
          {products.map((p) => (
            <li key={p.id}>
              <ReviewCard
                product={{
                  id: p.id,
                  title: p.title,
                  description: p.description,
                  price: p.price.toString(),
                  stock: p.stock,
                  status: p.status,
                  glbUrl: toCdnUrl(p.glbUrl),
                  polyCount: p.polyCount,
                  fileSize: p.fileSize,
                  rejectionReason: p.rejectionReason,
                  createdAt: p.createdAt.toISOString(),
                  vendor: p.vendor,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterTabs({ current }: { current: "PENDING" | "APPROVED" | "REJECTED" }) {
  const tabs = [
    { value: "PENDING", label: "Pending", href: "/admin/products" },
    { value: "APPROVED", label: "Approved", href: "/admin/products?status=approved" },
    { value: "REJECTED", label: "Rejected", href: "/admin/products?status=rejected" },
  ] as const;
  return (
    <nav className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white p-1 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      {tabs.map((t) => (
        <a
          key={t.value}
          href={t.href}
          className={`rounded px-3 py-1.5 ${
            current === t.value
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
