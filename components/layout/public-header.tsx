import Link from "next/link";

import { auth } from "@/auth";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { CartBadge } from "./cart-badge";

export async function PublicHeader() {
  const session = await auth();
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 dark:border-zinc-800/80 dark:bg-zinc-950/70 dark:supports-[backdrop-filter]:bg-zinc-950/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="group flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-900 text-[11px] font-semibold tracking-tight text-white shadow-sm shadow-zinc-900/20 transition-transform duration-150 group-hover:scale-105 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none">
              3D
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Marketplace
            </span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            <Link
              href="/products"
              className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            >
              Browse
            </Link>
            {session?.user && (
              <Link
                href="/account/orders"
                className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                Orders
              </Link>
            )}
            {session?.user?.role === "VENDOR" && (
              <Link
                href="/vendor"
                className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                Vendor
              </Link>
            )}
            {session?.user?.role === "ADMIN" && (
              <Link
                href="/admin"
                className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                Admin
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CartBadge />
          {session?.user ? (
            <form action={signOutAction}>
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-md px-3 py-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 sm:inline-flex dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium tracking-tight text-white shadow-sm shadow-zinc-900/10 transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none dark:hover:bg-white"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
