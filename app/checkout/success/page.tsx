import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CartClearer } from "./cart-clearer";

export const metadata = { title: "Order received" };

type Params = Promise<{ session_id?: string }>;

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Params;
}) {
  const { session_id } = await searchParams;
  const session = await auth();
  if (!session?.user || !session_id) {
    return <Fallback />;
  }

  // Find the order by stripeSessionId. The webhook may not have fired yet, so
  // an order in PENDING state is still a successful UX outcome here.
  const order = await prisma.order.findUnique({
    where: { stripeSessionId: session_id },
    include: {
      items: {
        include: { product: { select: { title: true } } },
      },
    },
  });

  if (!order || order.customerId !== session.user.id) {
    return <Fallback />;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <CartClearer />
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Thanks for your order
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {order.status === "PAID"
              ? "Payment confirmed. A receipt is on its way."
              : "Payment processing — we'll email you a receipt once it's confirmed."}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Order ID</span>
          <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{order.id}</span>
        </div>
        <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {item.product.title}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Qty {item.quantity} · {formatCurrency(Number(item.unitPrice.toString()))} each
                </p>
              </div>
              <div className="text-zinc-900 dark:text-zinc-100">
                {formatCurrency(Number(item.unitPrice.toString()) * item.quantity)}
              </div>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
            <dt>Subtotal</dt>
            <dd>{formatCurrency(Number(order.subtotal.toString()))}</dd>
          </div>
          {Number(order.discountAmount.toString()) > 0 && (
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
              <dt>Discount{order.promoCode ? ` (${order.promoCode})` : ""}</dt>
              <dd>−{formatCurrency(Number(order.discountAmount.toString()))}</dd>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between border-t border-zinc-200 pt-2 text-base font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
            <dt>Total</dt>
            <dd>{formatCurrency(Number(order.total.toString()))}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/account/orders"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          View all orders
        </Link>
        <Link
          href="/products"
          className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Keep browsing
        </Link>
      </div>
    </div>
  );
}

function Fallback() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        We couldn&apos;t find that order
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        If you just paid, it should appear in your order history shortly.
      </p>
      <Link
        href="/account/orders"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        View orders
      </Link>
    </div>
  );
}
