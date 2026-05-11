"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const slugify = (input: string) =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

const onboardingSchema = z.object({
  storeName: z.string().min(2, "Store name is required").max(60),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
});

export type OnboardingState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

export async function createVendorStore(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "VENDOR" && session.user.role !== "ADMIN") {
    return { error: "Only vendor accounts can create a store." };
  }

  const parsed = onboardingSchema.safeParse({
    storeName: formData.get("storeName"),
    description: formData.get("description") || undefined,
    logoUrl: formData.get("logoUrl") || undefined,
  });

  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const existing = await prisma.vendor.findUnique({
    where: { userId: session.user.id },
  });
  if (existing) redirect("/vendor");

  const baseSlug = slugify(parsed.data.storeName);
  let slug = baseSlug;
  for (let i = 1; await prisma.vendor.findUnique({ where: { slug } }); i++) {
    slug = `${baseSlug}-${i}`;
  }

  // Storefront is pending admin approval (per AGENTS §3.7).
  await prisma.vendor.create({
    data: {
      userId: session.user.id,
      storeName: parsed.data.storeName,
      slug,
      description: parsed.data.description,
      logoUrl: parsed.data.logoUrl || null,
    },
  });

  redirect("/vendor");
}
