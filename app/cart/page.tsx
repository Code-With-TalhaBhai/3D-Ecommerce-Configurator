import { CartView } from "./cart-view";

export default function CartPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Your cart
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Items stay here across reloads on this device.
      </p>
      <div className="mt-8">
        <CartView />
      </div>
    </div>
  );
}
