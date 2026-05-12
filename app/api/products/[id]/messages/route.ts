import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchThread, sendChatMessage } from "@/lib/messages";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

const postSchema = z.object({
  body: z.string().min(1).max(2000),
  // Optional override — the vendor uses this to pick which customer to reply to;
  // for a customer, the other party is always the product's vendor.
  withUserId: z.string().min(1).optional(),
});

async function loadParticipants(productId: string, currentUserId: string, withUserId?: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, vendor: { select: { userId: true } } },
  });
  if (!product) return { error: "Product not found.", status: 404 } as const;

  const vendorUserId = product.vendor.userId;

  // Vendor → must specify which customer they're talking to.
  if (currentUserId === vendorUserId) {
    if (!withUserId) {
      return { error: "Vendor must specify withUserId.", status: 400 } as const;
    }
    return {
      productId: product.id,
      currentUserId,
      otherUserId: withUserId,
      vendorUserId,
    } as const;
  }

  // Customer → always talking to the product's vendor.
  return {
    productId: product.id,
    currentUserId,
    otherUserId: vendorUserId,
    vendorUserId,
  } as const;
}

export async function GET(req: Request, ctx: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const withUserId = new URL(req.url).searchParams.get("withUserId") ?? undefined;

  const resolved = await loadParticipants(id, session.user.id, withUserId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const messages = await fetchThread(
    resolved.productId,
    resolved.currentUserId,
    resolved.otherUserId,
  );
  return NextResponse.json({
    messages,
    otherUserId: resolved.otherUserId,
  });
}

export async function POST(req: Request, ctx: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const resolved = await loadParticipants(id, session.user.id, body.withUserId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  // If sender is the vendor, additionally verify the other party has at least
  // engaged with the product (i.e. has sent a message or placed an order) — this
  // prevents a vendor from spamming arbitrary user IDs.
  if (resolved.currentUserId === resolved.vendorUserId) {
    const [hasMessaged, hasOrdered] = await Promise.all([
      prisma.message.count({
        where: {
          productId: resolved.productId,
          senderId: resolved.otherUserId,
        },
      }),
      prisma.orderItem.count({
        where: {
          productId: resolved.productId,
          order: { customerId: resolved.otherUserId },
        },
      }),
    ]);
    if (hasMessaged === 0 && hasOrdered === 0) {
      return NextResponse.json(
        { error: "That customer hasn't contacted you about this product." },
        { status: 403 },
      );
    }
  }

  try {
    const message = await sendChatMessage({
      productId: resolved.productId,
      senderId: resolved.currentUserId,
      receiverId: resolved.otherUserId,
      body: body.body,
    });
    return NextResponse.json({ message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send message.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
