import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/promos", label: "Promos" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 dark:border-zinc-800/80 dark:bg-zinc-950/70 dark:supports-[backdrop-filter]:bg-zinc-950/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-8">
            <Link href="/admin" className="group flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-900 text-[11px] font-semibold tracking-tight text-white shadow-sm shadow-zinc-900/20 transition-transform duration-150 group-hover:scale-105 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none">
                3D
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Admin
              </span>
            </Link>
            <nav className="hidden items-center gap-0.5 text-sm md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">
              {session.user.email}
            </span>
            <form action={signOutAction}>
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto px-6 py-1 text-xs md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2.5 py-1 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
