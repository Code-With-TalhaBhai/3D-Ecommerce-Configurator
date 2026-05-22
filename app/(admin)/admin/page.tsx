import Link from "next/link";
import { ArrowUpRight, Banknote, Clock, Package, Store } from "lucide-react";

import { prisma } from "@/lib/prisma";

export const metadata = { title: "Admin overview" };

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function AdminOverviewPage() {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    pendingProducts,
    approvedProducts,
    rejectedProducts,
    pendingVendors,
    approvedVendors,
    customers,
    admins,
    suspendedUsers,
    paidOrders,
    paidOrders30d,
    pendingOrders,
    revenueAgg,
    recentOrders,
    topVendorsRaw,
  ] = await Promise.all([
    prisma.product.count({ where: { status: "PENDING" } }),
    prisma.product.count({ where: { status: "APPROVED" } }),
    prisma.product.count({ where: { status: "REJECTED" } }),
    prisma.vendor.count({ where: { approvedAt: null } }),
    prisma.vendor.count({ where: { approvedAt: { not: null } } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { suspendedAt: { not: null } } }),
    prisma.order.count({ where: { status: "PAID" } }),
    prisma.order.count({ where: { status: "PAID", createdAt: { gte: since30d } } }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { status: "PAID" },
    }),
    prisma.order.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { email: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.groupBy({
      by: ["customerId"],
      where: { status: "PAID" },
      _sum: { total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
  ]);

  const revenue = revenueAgg._sum.total ? Number(revenueAgg._sum.total.toString()) : 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
          Admin
        </span>
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-zinc-900 sm:text-4xl dark:text-zinc-50">
          Overview
        </h1>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BigStat
          label="Lifetime revenue"
          value={formatCurrency(revenue)}
          accent="emerald"
          icon={<Banknote className="h-4 w-4" />}
        />
        <BigStat
          label="Paid orders"
          value={paidOrders}
          hint={`${paidOrders30d} in the last 30 days`}
          icon={<Package className="h-4 w-4" />}
        />
        <BigStat
          label="Pending review"
          value={pendingProducts}
          href="/admin/products"
          accent={pendingProducts > 0 ? "amber" : undefined}
          icon={<Clock className="h-4 w-4" />}
        />
        <BigStat
          label="Pending vendors"
          value={pendingVendors}
          href="/admin/vendors"
          accent={pendingVendors > 0 ? "amber" : undefined}
          icon={<Store className="h-4 w-4" />}
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <SmallStatGroup
          title="Products"
          rows={[
            { label: "Approved", value: approvedProducts },
            { label: "Pending", value: pendingProducts, accent: pendingProducts > 0 },
            { label: "Rejected", value: rejectedProducts },
          ]}
          href="/admin/products"
        />
        <SmallStatGroup
          title="Vendors"
          rows={[
            { label: "Approved", value: approvedVendors },
            { label: "Pending", value: pendingVendors, accent: pendingVendors > 0 },
          ]}
          href="/admin/vendors"
        />
        <SmallStatGroup
          title="Users"
          rows={[
            { label: "Customers", value: customers },
            { label: "Admins", value: admins },
            { label: "Suspended", value: suspendedUsers, accent: suspendedUsers > 0 },
          ]}
          href="/admin/users"
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm shadow-zinc-900/[0.03] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none">
          <header className="flex items-center justify-between border-b border-zinc-200/80 px-5 py-3 dark:border-zinc-800/80">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Recent orders
            </h2>
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              View all
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </header>
          {recentOrders.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No orders yet.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
              {recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {order.customer.name ?? order.customer.email}
                    </p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {order._count.items} item{order._count.items === 1 ? "" : "s"} ·{" "}
                      {order.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <OrderStatusPill status={order.status} />
                    <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(Number(order.total.toString()))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm shadow-zinc-900/[0.03] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none">
          <header className="border-b border-zinc-200/80 px-5 py-3 dark:border-zinc-800/80">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Operational alerts
            </h2>
          </header>
          <ul className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
            <AlertRow
              label="Products awaiting review"
              count={pendingProducts}
              href="/admin/products"
            />
            <AlertRow
              label="Vendors awaiting approval"
              count={pendingVendors}
              href="/admin/vendors?status=pending"
            />
            <AlertRow
              label="Orders stuck pending"
              count={pendingOrders}
              href="/admin/orders?status=pending"
            />
            <AlertRow
              label="Suspended users"
              count={suspendedUsers}
              href="/admin/users?status=suspended"
              neutral
            />
            {topVendorsRaw.length > 0 && (
              <li className="px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                Top customer spend:{" "}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {formatCurrency(Number(topVendorsRaw[0]._sum.total?.toString() ?? "0"))}
                </span>
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}

function BigStat({
  label,
  value,
  hint,
  href,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  accent?: "amber" | "emerald";
  icon?: React.ReactNode;
}) {
  const accentClass =
    accent === "amber"
      ? "border-amber-200/80 bg-gradient-to-br from-amber-50 to-white dark:border-amber-700/40 dark:from-amber-950/30 dark:to-zinc-900"
      : accent === "emerald"
        ? "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-700/40 dark:from-emerald-950/30 dark:to-zinc-900"
        : "border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-900";
  const iconBg =
    accent === "amber"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      : accent === "emerald"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

  const content = (
    <div
      className={`group relative rounded-2xl border p-5 shadow-sm shadow-zinc-900/[0.03] transition-all dark:shadow-none ${accentClass} ${href ? "hover:-translate-y-0.5 hover:shadow-md hover:shadow-zinc-900/[0.06]" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
          {label}
        </div>
        {icon && (
          <span className={`grid h-7 w-7 place-items-center rounded-md ${iconBg}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-zinc-50">
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>
      )}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function SmallStatGroup({
  title,
  rows,
  href,
}: {
  title: string;
  rows: { label: string; value: number; accent?: boolean }[];
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-900/[0.03] transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md hover:shadow-zinc-900/[0.06] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none dark:hover:border-zinc-700"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h3>
        <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-zinc-500" />
      </div>
      <dl className="mt-3 flex flex-col gap-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <dt className="text-zinc-500 dark:text-zinc-400">{r.label}</dt>
            <dd
              className={
                r.accent
                  ? "font-semibold tabular-nums text-amber-700 dark:text-amber-300"
                  : "font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
              }
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}

function AlertRow({
  label,
  count,
  href,
  neutral,
}: {
  label: string;
  count: number;
  href: string;
  neutral?: boolean;
}) {
  const highlight = !neutral && count > 0;
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between px-5 py-3 text-sm transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
      >
        <span className="text-zinc-700 dark:text-zinc-300">{label}</span>
        <span
          className={
            highlight
              ? "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-2 text-[11px] font-semibold tabular-nums text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
              : "text-sm font-semibold tabular-nums text-zinc-500 dark:text-zinc-400"
          }
        >
          {count}
        </span>
      </Link>
    </li>
  );
}

const orderStatusStyle: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  PAID: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  SHIPPED: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  DELIVERED: "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
  CANCELLED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  REFUNDED: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

function OrderStatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${orderStatusStyle[status] ?? ""}`}
    >
      {status}
    </span>
  );
}
