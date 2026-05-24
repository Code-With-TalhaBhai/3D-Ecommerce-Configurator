import { Skeleton } from "@/components/ui/skeleton";

// Mirrors ProductConfigurator's two-column layout so the page doesn't reflow
// when the real content replaces this fallback.
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <nav className="mb-6">
        <Skeleton className="h-7 w-28" />
      </nav>

      <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
        {/* Viewer column */}
        <div className="flex flex-col gap-3">
          <Skeleton className="aspect-square w-full rounded-2xl lg:aspect-auto lg:h-[calc(100dvh-9rem)]" />
          <div className="flex justify-center">
            <Skeleton className="h-4 w-48" />
          </div>
        </div>

        {/* Aside column */}
        <aside className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>

          <Skeleton className="h-9 w-40" />

          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full" />
            ))}
          </div>

          <Skeleton className="h-[280px] w-full rounded-2xl" />
          <Skeleton className="h-11 w-full" />

          <div className="rounded-2xl border border-zinc-200/80 p-5 dark:border-zinc-800/80">
            <Skeleton className="mb-3 h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-11/12" />
            <Skeleton className="mt-2 h-4 w-4/5" />
          </div>
        </aside>
      </div>
    </div>
  );
}
