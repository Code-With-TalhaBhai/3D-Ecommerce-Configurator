"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";

import { useAppSelector } from "@/store/hooks";

export function CartBadge() {
  const count = useAppSelector((s) => s.cart.items.reduce((n, i) => n + i.quantity, 0));
  return (
    <Link
      href="/cart"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      aria-label="Cart"
    >
      <ShoppingCart className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-900 px-1 text-[10px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          {count}
        </span>
      )}
    </Link>
  );
}
