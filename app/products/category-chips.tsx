"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

type CategoryOption = { name: string; slug: string };

// Selecting a category always drops ?page — the old page number is meaningless
// against a different result set.
function hrefFor(params: URLSearchParams, slug: string) {
  const next = new URLSearchParams(params);
  next.delete("page");
  if (slug) next.set("category", slug);
  else next.delete("category");
  const qs = next.toString();
  return qs ? `/products?${qs}` : "/products";
}

export function CategoryChips({ categories }: { categories: CategoryOption[] }) {
  const params = useSearchParams();
  const active = params.get("category") ?? "";

  if (categories.length === 0) return null;

  const options: CategoryOption[] = [{ name: "All categories", slug: "" }, ...categories];

  return (
    <nav aria-label="Product categories" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex items-center gap-2">
        {options.map((c) => {
          const isActive = c.slug === active;
          return (
            <li key={c.slug || "all"}>
              <Link
                href={hrefFor(params, c.slug)}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-all duration-150",
                  isActive
                    ? "border-zinc-900 bg-zinc-900 text-white shadow-sm shadow-zinc-900/10 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-600 hover:-translate-y-0.5 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100",
                )}
              >
                {c.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
