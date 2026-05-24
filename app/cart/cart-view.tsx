"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/viewer/product-thumb";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  clearCart,
  removeItem,
  updateQuantity,
  type CartItem,
} from "@/store/slices/cartSlice";

const MAX_QTY = 99;

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function itemKey(i: CartItem) {
  return `${i.productId}::${i.variantId ?? ""}`;
}

export function CartView() {
  const items = useAppSelector((s) => s.cart.items);
  const dispatch = useAppDispatch();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items],
  );
  const totalItems = useMemo(
    () => items.reduce((n, i) => n + i.quantity, 0),
    [items],
  );

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.6fr,1fr]">
      <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {items.map((item) => (
          <li key={itemKey(item)} className="flex gap-4 p-4 sm:p-5">
            <ProductThumb
              src={item.thumbnailUrl}
              alt={item.title}
              className="h-20 w-20 shrink-0 rounded-md"
            />


            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {item.title}
                </h2>
                {item.variantId && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Variant configured
                  </p>
                )}
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {formatCurrency(item.price)} each
                </p>
              </div>

              <div className="flex items-center gap-3">
                <QuantityStepper
                  value={item.quantity}
                  onChange={(qty) =>
                    dispatch(
                      updateQuantity({
                        productId: item.productId,
                        variantId: item.variantId,
                        quantity: qty,
                      }),
                    )
                  }
                />
                <div className="min-w-20 text-right text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(item.price * item.quantity)}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    dispatch(
                      removeItem({
                        productId: item.productId,
                        variantId: item.variantId,
                      }),
                    )
                  }
                  className="rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-700 dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                  aria-label={`Remove ${item.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <aside className="flex flex-col gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 lg:sticky lg:top-20">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Order summary
          </h2>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <Row label={`Items (${totalItems})`} value={formatCurrency(subtotal)} />
            <Row label="Shipping" value={<span className="text-zinc-500">Calculated at checkout</span>} />
            <Row label="Tax" value={<span className="text-zinc-500">Calculated at checkout</span>} />
            <div className="my-2 border-t border-zinc-200 dark:border-zinc-800" />
            <Row
              label={<span className="font-medium">Subtotal</span>}
              value={
                <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(subtotal)}
                </span>
              }
            />
          </dl>

          <Link
            href="/checkout"
            aria-disabled={items.length === 0}
            className={cn(
              "mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200",
              items.length === 0 && "pointer-events-none opacity-50",
            )}
          >
            Checkout
          </Link>
          <p className="mt-2 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
            Checkout & payment land in the next iteration of this sprint.
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {showClearConfirm ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-zinc-600 dark:text-zinc-400">
                Remove all items?
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  dispatch(clearCart());
                  setShowClearConfirm(false);
                }}
              >
                Yes, clear
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowClearConfirm(true)}
              className="w-full"
            >
              Clear cart
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function QuantityStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="Decrease quantity"
        className="flex h-8 w-8 items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-8 px-2 text-center text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(MAX_QTY, value + 1))}
        disabled={value >= MAX_QTY}
        aria-label="Increase quantity"
        className="flex h-8 w-8 items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        <ShoppingBag className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
          Your cart is empty
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Browse 3D-configurable products and add a few to get started.
        </p>
      </div>
      <Link
        href="/products"
        className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Browse products
      </Link>
    </div>
  );
}
