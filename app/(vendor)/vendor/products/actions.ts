"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

export type DeleteResult = { ok: true } | { ok: false; error: string };

const idSchema = z.string().min(1);

/**
 * Deletes a vendor's own product. Blocked when the product has order line items
 * (would corrupt purchase history). Vendors can hide a sold product by editing
 * stock to 0 — a soft-delete pathway can come later if needed.
 */
export async function deleteProduct(formData: FormData): Promise<DeleteResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Sign in required." };
  if (session.user.role !== "VENDOR" && session.user.role !== "ADMIN") {
    return { ok: false, error: "Vendors only." };
  }

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Invalid product ID." };

  const vendor = await prisma.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!vendor && session.user.role !== "ADMIN") {
    return { ok: false, error: "No vendor profile." };
  }

  const product = await prisma.product.findUnique({
    where: { id: id.data },
    select: {
      id: true,
      vendorId: true,
      glbUrl: true,
      variants: { select: { textureUrl: true } },
      _count: { select: { orderItems: true } },
    },
  });
  if (!product) return { ok: false, error: "Product not found." };

  if (session.user.role !== "ADMIN" && (!vendor || product.vendorId !== vendor.id)) {
    return { ok: false, error: "That product isn't yours." };
  }
  if (product._count.orderItems > 0) {
    return { ok: false, error: "Product has orders — set stock to 0 instead of deleting." };
  }

  // Cascade in DB handles ProductVariant + Message rows (cascade delete on Product).
  await prisma.product.delete({ where: { id: product.id } });

  // Best-effort storage cleanup. Storage URLs may not be parseable (different
  // CDN host), so we only try when the URL embeds the bucket path predictably.
  await cleanupStorage(product.glbUrl);
  for (const v of product.variants) {
    await cleanupStorage(v.textureUrl);
  }

  revalidatePath("/vendor/products");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  return { ok: true };
}

function extractKey(url: string | null): string | null {
  if (!url) return null;
  // Try to extract the S3 object key after `/vendors/...`. Works for the
  // virtual-hosted S3 URL and most CloudFront setups using the same key suffix.
  const idx = url.indexOf("/vendors/");
  if (idx === -1) return null;
  return url.slice(idx + 1);
}

async function cleanupStorage(url: string | null) {
  const key = extractKey(url);
  if (!key) return;
  try {
    await storage.remove(key);
  } catch {
    // Best-effort.
  }
}
