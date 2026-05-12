import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserRow } from "./user-row";

export const metadata = { title: "User management" };

type SearchParams = Promise<{ role?: string; status?: string; q?: string }>;

const roleFilters = ["all", "admin", "vendor", "customer"] as const;
const statusFilters = ["all", "active", "suspended"] as const;

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  const { role, status, q } = await searchParams;
  const roleFilter = (roleFilters as readonly string[]).includes(role ?? "")
    ? (role as (typeof roleFilters)[number])
    : "all";
  const statusFilter = (statusFilters as readonly string[]).includes(status ?? "")
    ? (status as (typeof statusFilters)[number])
    : "all";

  const users = await prisma.user.findMany({
    where: {
      ...(roleFilter !== "all"
        ? { role: roleFilter.toUpperCase() as "ADMIN" | "VENDOR" | "CUSTOMER" }
        : {}),
      ...(statusFilter === "suspended" ? { suspendedAt: { not: null } } : {}),
      ...(statusFilter === "active" ? { suspendedAt: null } : {}),
      ...(q && q.trim()
        ? {
            OR: [
              { email: { contains: q.trim(), mode: "insensitive" as const } },
              { name: { contains: q.trim(), mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      suspendedAt: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Users
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {users.length} shown · max 100 per page
          </p>
        </div>
      </header>

      <FilterTabs current={roleFilter} statusCurrent={statusFilter} query={q ?? ""} />

      {users.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No users match those filters.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={{
                    id: u.id,
                    email: u.email,
                    name: u.name,
                    role: u.role,
                    suspendedAt: u.suspendedAt ? u.suspendedAt.toISOString() : null,
                    createdAt: u.createdAt.toISOString(),
                    orderCount: u._count.orders,
                  }}
                  isSelf={u.id === session?.user.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterTabs({
  current,
  statusCurrent,
  query,
}: {
  current: (typeof roleFilters)[number];
  statusCurrent: (typeof statusFilters)[number];
  query: string;
}) {
  function buildHref(role: string, status: string) {
    const sp = new URLSearchParams();
    if (role !== "all") sp.set("role", role);
    if (status !== "all") sp.set("status", status);
    if (query) sp.set("q", query);
    const qs = sp.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  }

  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white p-1 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        {roleFilters.map((r) => (
          <a
            key={r}
            href={buildHref(r, statusCurrent)}
            className={`rounded px-3 py-1.5 capitalize ${
              current === r
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {r}
          </a>
        ))}
      </nav>

      <nav className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white p-1 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        {statusFilters.map((s) => (
          <a
            key={s}
            href={buildHref(current, s)}
            className={`rounded px-3 py-1.5 capitalize ${
              statusCurrent === s
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {s}
          </a>
        ))}
      </nav>
    </div>
  );
}
