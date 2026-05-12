import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { ProductConfigurator } from "./product-configurator";

type Params = Promise<{ slug: string }>;

async function loadProduct(slug: string) {
  return prisma.product.findFirst({
    where: { slug, status: "APPROVED" },
    include: {
      vendor: { select: { storeName: true, slug: true } },
      variants: {
        select: {
          id: true,
          color: true,
          material: true,
          textureUrl: true,
        },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: "Product not found" };
  return {
    title: `${product.title} — ${product.vendor.storeName}`,
    description: product.description.slice(0, 160),
    openGraph: {
      title: product.title,
      description: product.description.slice(0, 200),
      type: "website",
      ...(product.thumbnailUrl ? { images: [product.thumbnailUrl] } : {}),
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link
          href="/products"
          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← All products
        </Link>
      </nav>

      <ProductConfigurator
        product={{
          id: product.id,
          title: product.title,
          description: product.description,
          price: product.price.toString(),
          stock: product.stock,
          glbUrl: product.glbUrl ?? null,
          thumbnailUrl: product.thumbnailUrl ?? null,
          polyCount: product.polyCount,
          fileSize: product.fileSize,
          vendor: product.vendor,
          variants: product.variants,
        }}
      />
    </div>
  );
}
