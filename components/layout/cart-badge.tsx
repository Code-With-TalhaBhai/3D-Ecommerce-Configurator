"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { useAppSelector } from "@/store/hooks";

export function CartBadge() {
  const count = useAppSelector((s) => s.cart.items.reduce((n, i) => n + i.quantity, 0));
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
