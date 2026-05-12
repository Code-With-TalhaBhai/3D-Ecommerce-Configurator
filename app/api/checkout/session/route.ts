import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  clientCartItemSchema,
  resolvePromoCode,
  validateCart,
  type CartValidationError,
} from "@/lib/cart-validation";

export const runtime = "nodejs";

const bodySchema = z.object({
  items: z.array(clientCartItemSchema).min(1),
  promoCode: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to check out." }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const validation = await validateCart(body.items);
  if (!validation.ok) {
    return NextResponse.json({ error: cartErrorMessage(validation.error), code: validation.error.code }, { status: 400 });
  }

  const promo = await resolvePromoCode(body.promoCode, validation.subtotal);
  if (!promo.ok) {
    return NextResponse.json({ error: promo.reason, code: "PROMO_INVALID" }, { status: 400 });
  }

  const discountAmount = promo.promo?.discount ?? 0;
  const total = Math.max(0, validation.subtotal - discountAmount);

  // Create the order first so the webhook has something to flip even if the client never returns.
  const order = await prisma.order.create({
    data: {
      customerId: session.user.id,
      subtotal: validation.subtotal,
      discountAmount,
      total,
      promoCode: promo.promo?.code ?? null,
      // status defaults to PENDING; webhook moves it to PAID.
      items: {
        create: validation.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      },
    },
    select: { id: true },
  });

  // Stripe wants amounts in the smallest currency unit (cents for USD).
  const stripe = getStripe();
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;

  // Apply discount via a one-shot Stripe coupon when present.
  let discounts: { coupon: string }[] | undefined;
  if (discountAmount > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: Math.round(discountAmount * 100),
      currency: "usd",
      duration: "once",
      name: promo.promo?.code ?? "Discount",
      metadata: { orderId: order.id },
    });
    discounts = [{ coupon: coupon.id }];
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: session.user.email ?? undefined,
    line_items: validation.lines.map((line) => ({
      price_data: {
        currency: "usd",
        unit_amount: Math.round(line.unitPrice * 100),
        product_data: {
          name: line.title,
          ...(line.thumbnailUrl ? { images: [line.thumbnailUrl] } : {}),
        },
      },
      quantity: line.quantity,
    })),
    discounts,
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancel?order_id=${order.id}`,
    metadata: { orderId: order.id },
    allow_promotion_codes: false, // we apply our own promo above
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { stripeSessionId: checkoutSession.id },
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Stripe did not return a session URL." }, { status: 500 });
  }

  return NextResponse.json({ url: checkoutSession.url, orderId: order.id });
}

function cartErrorMessage(error: CartValidationError) {
  switch (error.code) {
    case "EMPTY":
      return "Your cart is empty.";
    case "NOT_FOUND":
      return "One of your items is no longer available.";
    case "NOT_AVAILABLE":
      return `${error.title} is not currently available.`;
    case "OUT_OF_STOCK":
      return `Only ${error.available} of "${error.title}" available.`;
  }
}
