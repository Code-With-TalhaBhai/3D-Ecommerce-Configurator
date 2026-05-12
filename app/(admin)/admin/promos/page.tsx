import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PromoForm } from "./promo-form";
import { deletePromo, expirePromo } from "./actions";

export const metadata = { title: "Promo codes" };

function formatDiscount(type: "PERCENT" | "FIXED", value: string) {
  return type === "PERCENT" ? `${value}% off` : `$${value} off`;
}

export default async function AdminPromosPage() {
  const promos = await prisma.promoCode.findMany({
    orderBy: [{ expiresAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
  });

  const now = new Date();
  const active = promos.filter((p) => !p.expiresAt || p.expiresAt > now);
  const expired = promos.filter((p) => p.expiresAt && p.expiresAt <= now);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Promo codes
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Customers enter codes at checkout. Percent caps at 100%, fixed is in USD.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Create a code
        </h2>
        <PromoForm />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Active ({active.length})
        </h2>
        <PromoTable
          rows={active.map((p) => ({
            id: p.id,
            code: p.code,
            label: formatDiscount(p.discountType, p.discountValue.toString()),
            expiresAt: p.expiresAt?.toISOString() ?? null,
            createdAt: p.createdAt.toISOString(),
            active: true,
          }))}
        />
      </section>

      {expired.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Expired ({expired.length})
          </h2>
          <PromoTable
            rows={expired.map((p) => ({
              id: p.id,
              code: p.code,
              label: formatDiscount(p.discountType, p.discountValue.toString()),
              expiresAt: p.expiresAt?.toISOString() ?? null,
              createdAt: p.createdAt.toISOString(),
              active: false,
            }))}
          />
        </section>
      )}
    </div>
  );
}

type Row = {
  id: string;
  code: string;
  label: string;
  expiresAt: string | null;
  createdAt: string;
  active: boolean;
};

function PromoTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        None.
      </div>
    );
  }
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-3">Code</th>
            <th className="px-4 py-3">Discount</th>
            <th className="px-4 py-3">Expires</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-mono text-xs text-zinc-900 dark:text-zinc-100">
                {p.code}
              </td>
              <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{p.label}</td>
              <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                {p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "Never"}
              </td>
              <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                {new Date(p.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  {p.active && (
                    <form action={expirePromo}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Expire
                      </Button>
                    </form>
                  )}
                  <form action={deletePromo}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" variant="destructive" size="sm">
                      Delete
                    </Button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
