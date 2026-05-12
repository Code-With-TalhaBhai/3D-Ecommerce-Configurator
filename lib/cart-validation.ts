import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const clientCartItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.number().int().positive().max(99),
});

export type ClientCartItem = z.infer<typeof clientCartItemSchema>;

export type ValidatedLine = {
  productId: string;
  variantId: string | null;
  title: string;
  unitPrice: number; // dollars
  quantity: number;
  lineTotal: number; // dollars
  thumbnailUrl: string | null;
};

export type CartValidationError =
  | { code: "EMPTY" }
  | { code: "NOT_FOUND"; productId: string }
  | { code: "NOT_AVAILABLE"; productId: string; title: string }
  | { code: "OUT_OF_STOCK"; productId: string; title: string; available: number };

export type CartValidationResult =
  | { ok: true; lines: ValidatedLine[]; subtotal: number }
  | { ok: false; error: CartValidationError };

/**
 * Re-fetches products from the DB and rebuilds the cart with server-trusted prices and stock.
 * Never trust client-supplied price.
 */
export async function validateCart(items: ClientCartItem[]): Promise<CartValidationResult> {
  if (items.length === 0) return { ok: false, error: { code: "EMPTY" } };

  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      title: true,
      price: true,
      stock: true,
      status: true,
      thumbnailUrl: true,
    },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: ValidatedLine[] = [];
  let subtotal = 0;

  // Collapse duplicate (productId, variantId) rows so a malformed client cart can't double-charge.
  const merged = new Map<string, ClientCartItem>();
  for (const item of items) {
    const key = `${item.productId}::${item.variantId ?? ""}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + item.quantity);
    } else {
      merged.set(key, { ...item });
    }
  }

  for (const item of merged.values()) {
    const product = byId.get(item.productId);
    if (!product) return { ok: false, error: { code: "NOT_FOUND", productId: item.productId } };
    if (product.status !== "APPROVED") {
      return {
        ok: false,
        error: { code: "NOT_AVAILABLE", productId: product.id, title: product.title },
      };
    }
    if (item.quantity > product.stock) {
      return {
        ok: false,
        error: {
          code: "OUT_OF_STOCK",
          productId: product.id,
          title: product.title,
          available: product.stock,
        },
      };
    }
    const unitPrice = Number(product.price.toString());
    const lineTotal = unitPrice * item.quantity;
    lines.push({
      productId: product.id,
      variantId: item.variantId ?? null,
      title: product.title,
      unitPrice,
      quantity: item.quantity,
      lineTotal,
      thumbnailUrl: product.thumbnailUrl,
    });
    subtotal += lineTotal;
  }

  return { ok: true, lines, subtotal: round2(subtotal) };
}

export type PromoResolution =
  | { ok: true; promo: { code: string; discount: number } | null }
  | { ok: false; reason: string };

/**
 * Resolves a promo code (case-insensitive) and returns the discount in dollars.
 * Returns `{ ok: true, promo: null }` when the user didn't supply one.
 */
export async function resolvePromoCode(
  code: string | null | undefined,
  subtotal: number,
): Promise<PromoResolution> {
  if (!code) return { ok: true, promo: null };
  const trimmed = code.trim();
  if (!trimmed) return { ok: true, promo: null };

  const promo = await prisma.promoCode.findUnique({
    where: { code: trimmed.toUpperCase() },
  });
  if (!promo) return { ok: false, reason: "Promo code not found." };
  if (promo.expiresAt && promo.expiresAt < new Date()) {
    return { ok: false, reason: "Promo code has expired." };
  }

  const value = Number(promo.discountValue.toString());
  let discount = 0;
  if (promo.discountType === "PERCENT") {
    discount = (subtotal * Math.min(100, Math.max(0, value))) / 100;
  } else {
    discount = Math.min(subtotal, Math.max(0, value));
  }

  return {
    ok: true,
    promo: { code: promo.code, discount: round2(discount) },
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
