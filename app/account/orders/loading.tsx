import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72" />
      </header>

      <ul className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="rounded-2xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800/80 dark:bg-zinc-900"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
