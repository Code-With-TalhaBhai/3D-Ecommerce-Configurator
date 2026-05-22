import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Package, Plus, Sparkles } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export const metadata = { title: "Vendor dashboard" };

export default async function VendorDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const vendor = await prisma.vendor.findUnique({
    where: { userId: session.user.id },
    include: { _count: { select: { products: true } } },
  });

  if (!vendor) redirect("/vendor/onboarding");

  const isLive = Boolean(vendor.approvedAt);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            Vendor dashboard
          </span>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.025em] text-zinc-900 sm:text-4xl dark:text-zinc-50">
            {vendor.storeName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            /{vendor.slug}
          </p>
        </div>
        <Link
          href="/vendor/products/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium tracking-tight text-white shadow-sm shadow-zinc-900/20 transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none dark:hover:bg-white"
        >
          <Plus className="h-4 w-4" />
          Upload product
        </Link>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Products"
          value={vendor._count.products}
          icon={<Package className="h-4 w-4" />}
        />
        <Stat
          label="Storefront"
          value={isLive ? "Live" : "Pending review"}
          tone={isLive ? "emerald" : "amber"}
          icon={<Sparkles className="h-4 w-4" />}
        />
        <Stat
          label="Joined"
          value={vendor.createdAt.toLocaleDateString()}
        />
      </div>

      {vendor._count.products === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-12 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <Package className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            No products yet
          </p>
          <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            Upload your first GLB model to start selling. Models are compressed and reviewed automatically.
          </p>
          <Link
            href="/vendor/products/new"
            className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium tracking-tight text-white shadow-sm shadow-zinc-900/20 transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none dark:hover:bg-white"
          >
            <Plus className="h-4 w-4" />
            Upload first product
          </Link>
        </div>
      ) : (
        <div className="mt-10 flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm shadow-zinc-900/[0.03] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Manage your catalog
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Edit pricing, stock, and respond to product reviews from the catalog page.
            </p>
          </div>
          <Link
            href="/vendor/products"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium tracking-tight text-zinc-900 shadow-sm shadow-zinc-900/[0.03] transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-none dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
          >
            View products
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: "emerald" | "amber";
}) {
  const toneClasses =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : "text-zinc-900 dark:text-zinc-50";

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-900/[0.03] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
          {label}
        </div>
        {icon && (
          <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-2 text-2xl font-semibold tracking-[-0.02em] ${toneClasses}`}>
        {value}
      </div>
    </div>
  );
}
