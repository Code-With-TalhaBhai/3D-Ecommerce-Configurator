import { Skeleton } from "@/components/ui/skeleton";

// Skeleton mirrors the products grid layout — header block, search bar, then
// a 4-column card grid. PublicHeader (from layout) keeps rendering above.
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-8 flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </header>

      <div className="mb-8">
        <Skeleton className="h-10 w-full max-w-2xl rounded-lg" />
      </div>

      <Skeleton className="mb-5 h-3 w-20" />

      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <li
            key={i}
            className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-900"
          >
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="flex flex-col gap-2 p-5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-4 w-3/4" />
              <div className="mt-2 flex items-end justify-between">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
