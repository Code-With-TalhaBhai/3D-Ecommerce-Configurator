import Link from "next/link";
import { XCircle } from "lucide-react";

export const metadata = { title: "Checkout canceled" };

export default function CheckoutCancelPage() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        <XCircle className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Checkout canceled
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        No charge was made. Your cart is still here whenever you&apos;re ready.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/cart"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Back to cart
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
