import { Skeleton } from "@/components/ui/skeleton";

// Inherited by every /vendor/* segment unless a deeper loading.tsx overrides it.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72" />
      </header>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800/80 dark:bg-zinc-900"
          >
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 dark:border-zinc-800/80 dark:bg-zinc-900">
        <Skeleton className="mb-5 h-5 w-40" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
