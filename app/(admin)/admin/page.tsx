import Link from "next/link";

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
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Overview
      </h1>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BigStat label="Lifetime revenue" value={formatCurrency(revenue)} accent="emerald" />
        <BigStat label="Paid orders" value={paidOrders} hint={`${paidOrders30d} in the last 30 days`} />
        <BigStat
          label="Pending review"
          value={pendingProducts}
          href="/admin/products"
          accent={pendingProducts > 0 ? "amber" : undefined}
        />
        <BigStat
          label="Pending vendors"
          value={pendingVendors}
          href="/admin/vendors"
          accent={pendingVendors > 0 ? "amber" : undefined}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
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

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Recent orders
            </h2>
            <Link
              href="/admin/orders"
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              View all →
            </Link>
          </header>
          {recentOrders.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No orders yet.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
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
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(Number(order.total.toString()))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <header className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Operational alerts
            </h2>
          </header>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
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
                Top customer:{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
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
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  accent?: "amber" | "emerald";
}) {
  const accentClass =
    accent === "amber"
      ? "border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/20"
      : accent === "emerald"
        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700/60 dark:bg-emerald-900/20"
        : "border-zinc-200 dark:border-zinc-800";
  const content = (
    <div className={`rounded-xl border bg-white p-5 dark:bg-zinc-900 ${accentClass}`}>
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
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
      className="block rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
    >
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      <dl className="mt-3 flex flex-col gap-1.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <dt className="text-zinc-500 dark:text-zinc-400">{r.label}</dt>
            <dd
              className={
                r.accent
                  ? "font-semibold text-amber-700 dark:text-amber-300"
                  : "font-medium text-zinc-900 dark:text-zinc-100"
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
        className="flex items-center justify-between px-5 py-3 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-950/40"
      >
        <span className="text-zinc-700 dark:text-zinc-300">{label}</span>
        <span
          className={
            highlight
              ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
              : "text-sm font-medium text-zinc-500 dark:text-zinc-400"
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
