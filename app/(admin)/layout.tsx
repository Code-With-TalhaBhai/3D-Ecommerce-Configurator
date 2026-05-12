import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-6">
          <Link
            href="/admin"
            className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            Admin Console
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/admin"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Overview
            </Link>
            <Link
              href="/admin/products"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Products
            </Link>
            <Link
              href="/admin/vendors"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Vendors
            </Link>
            <Link
              href="/admin/users"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Users
            </Link>
            <Link
              href="/admin/orders"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Orders
            </Link>
            <Link
              href="/admin/promos"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Promos
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {session.user.email}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
