import { NextResponse } from "next/server";
import Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";
// Stripe must verify against the raw body — don't use req.json().
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await markOrderPaid(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        await markOrderCancelled(event.data.object as Stripe.Checkout.Session);
        break;
      }
      default:
        // Other events (payment_intent.*, charge.*) aren't relevant to us yet.
        break;
    }
  } catch (err) {
    // Returning 500 makes Stripe retry — that's what we want when our DB blip is transient.
    const msg = err instanceof Error ? err.message : "Webhook handler failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function markOrderPaid(stripeSession: Stripe.Checkout.Session) {
  const orderId = stripeSession.metadata?.orderId;
  if (!orderId) return; // foreign session, ignore

  // Idempotent: only flip + decrement when transitioning out of PENDING.
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, items: { select: { productId: true, quantity: true } } },
    });
    if (!order) return;
    if (order.status !== "PENDING") return;

    await tx.order.update({
      where: { id: orderId },
      data: { status: "PAID" },
    });

    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }
  });
}

async function markOrderCancelled(stripeSession: Stripe.Checkout.Session) {
  const orderId = stripeSession.metadata?.orderId;
  if (!orderId) return;

  await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
}
