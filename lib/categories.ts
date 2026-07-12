import "server-only";

import { prisma } from "@/lib/prisma";

// The seeded default category (see migration 20260712000000_add_categories).
// Every product that isn't given an explicit category lands here, and deleting
// a category reassigns its products here.
export const OTHERS_CATEGORY_SLUG = "others";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

export { slugify as slugifyCategory };

/**
 * Resolve the id of the default "Others" category, creating it if it somehow
 * went missing. The row is seeded by migration, so this is a safety net.
 */
export async function getOthersCategoryId(): Promise<string> {
  const existing = await prisma.category.findUnique({
    where: { slug: OTHERS_CATEGORY_SLUG },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.category.create({
    data: { name: "Others", slug: OTHERS_CATEGORY_SLUG },
    select: { id: true },
  });
  return created.id;
}

/**
 * Validate a caller-supplied category id, falling back to "Others" when it's
 * missing or doesn't reference a real category.
 */
export async function resolveCategoryId(
  categoryId: string | null | undefined,
): Promise<string> {
  if (categoryId) {
    const found = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (found) return found.id;
  }
  return getOthersCategoryId();
}
