"use client";

import Link from "next/link";
import { Loader2, TicketPercent } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSelector } from "@/store/hooks";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function CheckoutClient() {
  const items = useAppSelector((s) => s.cart.items);
  const [promoCode, setPromoCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items],
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
          promoCode: promoCode.trim() || null,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }
      // Hand off to Stripe-hosted Checkout.
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          There&apos;s nothing in your cart yet.
        </p>
        <Link
          href="/products"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
      <section className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        <header className="px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Order ({items.length} item{items.length === 1 ? "" : "s"})
          </h2>
        </header>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {items.map((item) => (
            <li
              key={`${item.productId}::${item.variantId ?? ""}`}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-950">
                  {item.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-zinc-400">
                      3D
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {item.title}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatCurrency(item.price)} × {item.quantity}
                  </p>
                </div>
              </div>
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {formatCurrency(item.price * item.quantity)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Summary
          </h2>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                <TicketPercent className="h-3.5 w-3.5" /> Promo code (optional)
              </span>
              <Input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="SUMMER10"
                maxLength={32}
                disabled={submitting}
              />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                We&apos;ll apply the discount before payment.
              </span>
            </label>
          </div>

          <dl className="mt-4 flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
              <dt>Subtotal</dt>
              <dd>{formatCurrency(subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between text-zinc-500">
              <dt>Tax</dt>
              <dd>Calculated by Stripe</dd>
            </div>
            <div className="my-2 border-t border-zinc-200 dark:border-zinc-800" />
            <div className="flex items-center justify-between text-base font-semibold text-zinc-900 dark:text-zinc-100">
              <dt>Total</dt>
              <dd>{formatCurrency(subtotal)}</dd>
            </div>
          </dl>

          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}

          <Button type="submit" className="mt-5 w-full" disabled={submitting} size="lg">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Redirecting to Stripe…
              </>
            ) : (
              "Continue to payment"
            )}
          </Button>
          <p className="mt-2 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
            You&apos;ll be redirected to Stripe to enter card details.
          </p>
        </div>
      </aside>
    </form>
  );
}
