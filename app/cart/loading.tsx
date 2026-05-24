import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-72" />
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.6fr,1fr]">
        <ul className="flex flex-col divide-y divide-zinc-200/80 rounded-2xl border border-zinc-200/80 bg-white dark:divide-zinc-800/80 dark:border-zinc-800/80 dark:bg-zinc-900">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex gap-4 p-5">
              <Skeleton className="h-20 w-20 rounded-md" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-8 w-24" />
            </li>
          ))}
        </ul>

        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800/80 dark:bg-zinc-900">
            <Skeleton className="mb-4 h-5 w-32" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-5 h-11 w-full" />
          </div>
        </aside>
      </div>
    </div>
  );
}
