import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { approveVendor, unapproveVendor } from "./actions";

export const metadata = { title: "Vendor management" };

type SearchParams = Promise<{ status?: string }>;

const filters = ["all", "approved", "pending"] as const;

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { status } = await searchParams;
  const filter = (filters as readonly string[]).includes(status ?? "")
    ? (status as (typeof filters)[number])
    : "all";

  const vendors = await prisma.vendor.findMany({
    where:
      filter === "approved"
        ? { approvedAt: { not: null } }
        : filter === "pending"
          ? { approvedAt: null }
          : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { email: true, name: true, suspendedAt: true } },
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Vendors
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Vendor storefronts. Approval is a trust badge — individual products still go through the product review queue.
          </p>
        </div>
        <nav className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white p-1 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {filters.map((f) => (
            <a
              key={f}
              href={f === "all" ? "/admin/vendors" : `/admin/vendors?status=${f}`}
              className={`rounded px-3 py-1.5 capitalize ${
                filter === f
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {f}
            </a>
          ))}
        </nav>
      </header>

      {vendors.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filter === "all" ? "No vendors yet." : `No ${filter} vendors.`}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {vendors.map((v) => {
            const approved = !!v.approvedAt;
            const suspended = !!v.user.suspendedAt;
            return (
              <li
                key={v.id}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start gap-4 p-5">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    {v.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {v.storeName.slice(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        {v.storeName}
                      </h2>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          approved
                            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                        }`}
                      >
                        {approved ? "Approved" : "Pending"}
                      </span>
                      {suspended && (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-900 dark:bg-red-900/40 dark:text-red-200">
                          Owner suspended
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      /{v.slug} · {v.user.name ?? v.user.email}
                    </p>
                    {v.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {v.description}
                      </p>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-3 gap-px bg-zinc-200 text-center text-xs dark:bg-zinc-800">
                  <div className="bg-white px-3 py-2 dark:bg-zinc-900">
                    <dt className="text-zinc-500 dark:text-zinc-400">Products</dt>
                    <dd className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {v._count.products}
                    </dd>
                  </div>
                  <div className="bg-white px-3 py-2 dark:bg-zinc-900">
                    <dt className="text-zinc-500 dark:text-zinc-400">Joined</dt>
                    <dd className="font-medium text-zinc-700 dark:text-zinc-300">
                      {v.createdAt.toLocaleDateString()}
                    </dd>
                  </div>
                  <div className="bg-white px-3 py-2 dark:bg-zinc-900">
                    <dt className="text-zinc-500 dark:text-zinc-400">Approved</dt>
                    <dd className="font-medium text-zinc-700 dark:text-zinc-300">
                      {v.approvedAt ? v.approvedAt.toLocaleDateString() : "—"}
                    </dd>
                  </div>
                </dl>

                <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
                  {approved ? (
                    <form action={unapproveVendor}>
                      <input type="hidden" name="id" value={v.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Revoke approval
                      </Button>
                    </form>
                  ) : (
                    <form action={approveVendor}>
                      <input type="hidden" name="id" value={v.id} />
                      <Button type="submit" size="sm">
                        Approve
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
