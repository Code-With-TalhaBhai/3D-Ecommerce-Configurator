import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toCdnUrl } from "@/lib/storage/cdn";
import { GlbThumbLazy } from "@/components/viewer/glb-thumb-lazy";
import { ProductActions } from "./product-actions";

function ThumbPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-[10px] uppercase tracking-wider text-zinc-400 dark:from-zinc-800 dark:to-zinc-900">
      3D
    </div>
  );
}

export const metadata = { title: "Your products" };

const statusBadgeClass: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  REJECTED: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

function formatBytes(n: number | null | undefined) {
  if (!n) return "—";
  const mb = n / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;
}

export default async function VendorProductsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const vendor = await prisma.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!vendor) redirect("/vendor/onboarding");

  const products = await prisma.product.findMany({
    where: { vendorId: vendor.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      price: true,
      stock: true,
      status: true,
      glbUrl: true,
      polyCount: true,
      fileSize: true,
      rejectionReason: true,
      createdAt: true,
      _count: { select: { orderItems: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Your products
        </h1>
        <Link
          href="/vendor/products/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Upload product
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            You haven&apos;t uploaded any products yet.
          </p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {products.map((p) => (
            <li
              key={p.id}
              className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-[auto,1.5fr,repeat(5,auto),auto] sm:items-center">
                <div className="h-20 w-20 overflow-hidden rounded-md border border-zinc-200 bg-gradient-to-br from-zinc-50 to-zinc-100 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
                  {p.glbUrl ? (
                    <GlbThumbLazy src={toCdnUrl(p.glbUrl)!} className="h-full w-full" />
                  ) : (
                    <ThumbPlaceholder />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {p.title}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusBadgeClass[p.status] ?? ""}`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    /{p.slug}
                  </p>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="block uppercase tracking-wide">Price</span>
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">
                    ${p.price.toString()}
                  </span>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="block uppercase tracking-wide">Stock</span>
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">{p.stock}</span>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="block uppercase tracking-wide">Polys</span>
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">
                    {p.polyCount?.toLocaleString() ?? "—"}
                  </span>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="block uppercase tracking-wide">Size</span>
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">
                    {formatBytes(p.fileSize)}
                  </span>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="block uppercase tracking-wide">Date</span>
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">
                    {p.createdAt.toLocaleDateString()}
                  </span>
                </div>
                <div className="flex sm:justify-end">
                  <ProductActions
                    productId={p.id}
                    hasOrders={p._count.orderItems > 0}
                  />
                </div>
              </div>
              {p.status === "REJECTED" && p.rejectionReason && (
                <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  <span className="font-medium">Reviewer note:</span>{" "}
                  {p.rejectionReason}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
