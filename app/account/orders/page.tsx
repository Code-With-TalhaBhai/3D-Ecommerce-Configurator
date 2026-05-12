import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Your orders" };

const statusStyle: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  PAID: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  SHIPPED: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  DELIVERED: "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
  CANCELLED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  REFUNDED: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/account/orders");

  const orders = await prisma.order.findMany({
    where: { customerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: { product: { select: { title: true, slug: true } } },
      },
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Your orders
      </h1>

      {orders.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            You haven&apos;t placed any orders yet.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {orders.map((order) => (
            <li
              key={order.id}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[order.status] ?? ""}`}
                  >
                    {order.status}
                  </span>
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {order.id}
                  </span>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {order.createdAt.toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </header>

              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {order.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                  >
                    <div>
                      <Link
                        href={`/products/${item.product.slug}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {item.product.title}
                      </Link>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Qty {item.quantity} ·{" "}
                        {formatCurrency(Number(item.unitPrice.toString()))} each
                      </p>
                    </div>
                    <div className="text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(Number(item.unitPrice.toString()) * item.quantity)}
                    </div>
                  </li>
                ))}
              </ul>

              <footer className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 text-sm dark:border-zinc-800">
                <div className="text-zinc-500 dark:text-zinc-400">
                  {order.promoCode && (
                    <span>Promo: <span className="font-medium">{order.promoCode}</span></span>
                  )}
                </div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(Number(order.total.toString()))}
                </div>
              </footer>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
