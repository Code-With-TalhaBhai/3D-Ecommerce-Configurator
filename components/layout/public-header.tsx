import Link from "next/link";

import { auth } from "@/auth";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { CartBadge } from "./cart-badge";

export async function PublicHeader() {
  const session = await auth();
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200 bg-white/80 px-6 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
        >
          3D Marketplace
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/products"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Browse
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <CartBadge />
        {session?.user ? (
          <>
            <Link
              href="/account/orders"
              className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              Orders
            </Link>
            {session.user.role === "VENDOR" && (
              <Link
                href="/vendor"
                className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Vendor
              </Link>
            )}
            {session.user.role === "ADMIN" && (
              <Link
                href="/admin"
                className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Admin
              </Link>
            )}
            <form action={signOutAction}>
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
