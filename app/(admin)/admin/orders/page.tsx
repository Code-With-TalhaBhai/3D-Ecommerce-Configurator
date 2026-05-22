import Link from "next/link";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { OrderStatus } from "@/app/generated/prisma/enums";

export const metadata = { title: "Order management" };

type SearchParams = Promise<{ status?: string }>;

const statusFilters = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
] as const;

const statusStyle: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  PAID: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  SHIPPED: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  DELIVERED: "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
  CANCELLED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  REFUNDED: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { status } = await searchParams;
  const filter = statusFilters.find((s) => s.value === status)?.value ?? "all";

  const where: Prisma.OrderWhereInput =
    filter !== "all"
      ? { status: filter.toUpperCase() as OrderStatus }
      : {};

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      customer: { select: { email: true, name: true } },
      _count: { select: { items: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Orders
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {orders.length} shown · max 100 per page
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-1 rounded-md border border-zinc-200 bg-white p-1 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {statusFilters.map((s) => (
            <a
              key={s.value}
              href={s.value === "all" ? "/admin/orders" : `/admin/orders?status=${s.value}`}
              className={`rounded px-3 py-1.5 ${filter === s.value
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      {orders.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No orders match those filters.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Promo</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/40">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {o.id.slice(-10)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users?q=${encodeURIComponent(o.customer.email)}`}
                      className="text-zinc-900 hover:underline dark:text-zinc-100"
                    >
                      {o.customer.name ?? o.customer.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {o._count.items}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusStyle[o.status] ?? ""}`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {o.promoCode ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(Number(o.total.toString()))}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {o.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
