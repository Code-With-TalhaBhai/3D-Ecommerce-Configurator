"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { resolveCategoryId } from "@/lib/categories";

export type DeleteResult = { ok: true } | { ok: false; error: string };

export type UpdateProductState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

const idSchema = z.string().min(1);

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(120),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(5000),
  price: z.coerce.number().nonnegative("Price can't be negative").max(1_000_000),
  stock: z.coerce.number().int().min(0).max(100_000),
  categoryId: z.string().max(60).optional(),
});

/**
 * Updates a vendor's own product metadata (title, description, price, stock,
 * category). The GLB model, variants, and thumbnail are not editable here —
 * re-uploading a model has compression/storage implications tracked separately.
 * Status is left untouched: an approved vendor's edits stay live, a pending or
 * rejected product keeps its current state.
 */
export async function updateProduct(
  _prev: UpdateProductState,
  formData: FormData,
): Promise<UpdateProductState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };
  if (session.user.role !== "VENDOR" && session.user.role !== "ADMIN") {
    return { error: "Vendors only." };
  }

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    description: formData.get("description"),
    price: formData.get("price"),
    stock: formData.get("stock"),
    categoryId: formData.get("categoryId") || undefined,
  });
  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!vendor && session.user.role !== "ADMIN") {
    return { error: "No vendor profile." };
  }

  const product = await prisma.product.findUnique({
    where: { id: data.id },
    select: { id: true, vendorId: true },
  });
  if (!product) return { error: "Product not found." };
  if (session.user.role !== "ADMIN" && (!vendor || product.vendorId !== vendor.id)) {
    return { error: "That product isn't yours." };
  }

  const categoryId = await resolveCategoryId(data.categoryId);

  await prisma.product.update({
    where: { id: product.id },
    data: {
      title: data.title,
      description: data.description,
      price: data.price,
      stock: data.stock,
      categoryId,
    },
  });

  revalidatePath("/vendor/products");
  revalidatePath("/products");
  return { ok: true };
}

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
