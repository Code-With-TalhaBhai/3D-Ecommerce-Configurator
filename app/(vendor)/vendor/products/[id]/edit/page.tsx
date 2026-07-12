import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { EditProductForm } from "./edit-product-form";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const vendor = await prisma.vendor.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!vendor && session.user.role !== "ADMIN") redirect("/vendor/onboarding");

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      vendorId: true,
      title: true,
      slug: true,
      description: true,
      price: true,
      stock: true,
      status: true,
      categoryId: true,
    },
  });
  if (!product) notFound();
  if (session.user.role !== "ADMIN" && (!vendor || product.vendorId !== vendor.id)) {
    notFound();
  }

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/vendor/products"
        className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Edit product
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Update the listing details. The 3D model, variants, and thumbnail
          can&apos;t be changed here — re-upload the product to replace the model.
        </p>
      </div>

      <EditProductForm
        product={{
          id: product.id,
          title: product.title,
          description: product.description,
          price: product.price.toString(),
          stock: product.stock,
          categoryId: product.categoryId,
        }}
        categories={categories}
      />
    </div>
  );
}
