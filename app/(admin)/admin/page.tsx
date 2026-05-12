import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const metadata = { title: "Admin overview" };

export default async function AdminOverviewPage() {
  const [pending, approved, rejected, vendors, users] = await Promise.all([
    prisma.product.count({ where: { status: "PENDING" } }),
    prisma.product.count({ where: { status: "APPROVED" } }),
    prisma.product.count({ where: { status: "REJECTED" } }),
    prisma.vendor.count(),
    prisma.user.count(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Overview
      </h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Pending review" value={pending} href="/admin/products" highlight={pending > 0} />
        <Stat label="Approved" value={approved} />
        <Stat label="Rejected" value={rejected} />
        <Stat label="Vendors" value={vendors} />
        <Stat label="Users" value={users} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  highlight,
}: {
  label: string;
  value: number;
  href?: string;
  highlight?: boolean;
}) {
  const content = (
    <div
      className={`rounded-lg border bg-white p-4 transition-colors dark:bg-zinc-900 ${
        highlight
          ? "border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/20"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
