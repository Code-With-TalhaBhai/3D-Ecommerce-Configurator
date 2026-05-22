import { CartView } from "./cart-view";

export default function CartPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
          Cart
        </span>
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-zinc-900 sm:text-4xl dark:text-zinc-50">
          Your cart
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Items stay here across reloads on this device.
        </p>
      </div>
      <div className="mt-8">
        <CartView />
      </div>
    </div>
  );
}
