"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import {
  OTHERS_CATEGORY_SLUG,
  getOthersCategoryId,
  slugifyCategory,
} from "@/lib/categories";

export type CategoryFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(40, "Name must be 40 characters or fewer"),
  // Drives which AR mode the product detail page launches for every product
  // under this category — see components/viewer/ar-launcher.tsx. Create-time
  // only; categories have no edit action today.
  tryOnAnchor: z.enum(["WRIST", "FOOT"]).nullable(),
});

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireAdmin();

  const rawAnchor = formData.get("tryOnAnchor");
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    tryOnAnchor: rawAnchor === "WRIST" || rawAnchor === "FOOT" ? rawAnchor : null,
  });
  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const name = parsed.data.name;
  const slug = slugifyCategory(name);
  if (!slug) {
    return { fieldErrors: { name: ["Name must contain letters or numbers."] } };
  }

  const clash = await prisma.category.findFirst({
    where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { slug }] },
    select: { id: true },
  });
  if (clash) return { error: "A category with that name already exists." };

  await prisma.category.create({ data: { name, slug, tryOnAnchor: parsed.data.tryOnAnchor } });
  revalidatePath("/admin/categories");
  revalidatePath("/products");
  return null;
}

export async function deleteCategory(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const category = await prisma.category.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!category) return;
  // The default bucket can never be removed — products fall back to it.
  if (category.slug === OTHERS_CATEGORY_SLUG) return;

  const othersId = await getOthersCategoryId();
  // Reassign this category's products to "Others" before deleting so the
  // Restrict FK never blocks the delete and no product is left orphaned.
  await prisma.$transaction([
    prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: othersId },
    }),
    prisma.category.delete({ where: { id } }),
  ]);

  revalidatePath("/admin/categories");
  revalidatePath("/products");
}
