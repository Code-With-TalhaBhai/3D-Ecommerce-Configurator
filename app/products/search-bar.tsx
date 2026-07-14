"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [minPrice, setMinPrice] = useState(params.get("min") ?? "");
  const [maxPrice, setMaxPrice] = useState(params.get("max") ?? "");
  const category = params.get("category") ?? "";

  // Keep input fields in sync if the user navigates with back/forward.
  useEffect(() => {
    setQ(params.get("q") ?? "");
    setMinPrice(params.get("min") ?? "");
    setMaxPrice(params.get("max") ?? "");
  }, [params]);

  function applyFilters(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The category lives in the chip row below; carry it through untouched.
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (minPrice) next.set("min", minPrice);
    if (maxPrice) next.set("max", maxPrice);
    if (category) next.set("category", category);
    const qs = next.toString();
    router.push(qs ? `/products?${qs}` : "/products");
  }

  function clearAll() {
    setQ("");
    setMinPrice("");
    setMaxPrice("");
    router.push("/products");
  }

  const hasActiveFilters = q || minPrice || maxPrice || category;

  return (
    <form
      onSubmit={applyFilters}
      className="flex flex-col gap-3 rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm shadow-zinc-900/[0.03] backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:shadow-none sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="q" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Search
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title or description"
            className="pl-9"
          />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="min" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Min $
          </label>
          <Input
            id="min"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            placeholder="0"
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="max" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Max $
          </label>
          <Input
            id="max"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            placeholder="∞"
            className="w-24"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit">Apply</Button>
        {hasActiveFilters && (
          <Button type="button" variant="secondary" onClick={clearAll} aria-label="Clear filters">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
