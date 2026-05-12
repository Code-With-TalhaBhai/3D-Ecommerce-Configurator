import { CheckoutClient } from "./checkout-client";

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Checkout
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Review your order, apply a promo code, then continue to Stripe.
      </p>
      <div className="mt-8">
        <CheckoutClient />
      </div>
    </div>
  );
}
