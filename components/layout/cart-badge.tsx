"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";

import { useAppSelector } from "@/store/hooks";

/**
 * Cart icon + count badge. The cart count is read from Redux, but Redux is
 * populated from localStorage in a `useEffect` (see `app/providers.tsx` →
 * `hydrateCartFromStorage`). That means the server-rendered HTML always has
 * count=0, while the client may snap to the real count during the hydration
 * window — historically causing a React hydration mismatch on the
 * `aria-label` and the count pill (issues-list #18).
 *
 * Fix: gate every count-dependent output on a `mounted` flag that flips in
 * `useEffect` AFTER hydration commits. First client paint matches the
 * server (empty); the next render shows the real value.
 */
export function CartBadge() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const storedCount = useAppSelector((s) =>
    s.cart.items.reduce((n, i) => n + i.quantity, 0),
  );
  const count = mounted ? storedCount : 0;

  return (
    <Link
      href="/cart"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
    >
      <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.75} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-zinc-900 px-1 text-[10px] font-semibold tabular-nums text-white ring-2 ring-white dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-950">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
