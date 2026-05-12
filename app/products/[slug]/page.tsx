import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ProductChatPanel } from "@/components/chat/product-chat-panel";
import { ProductConfigurator } from "./product-configurator";

type Params = Promise<{ slug: string }>;

async function loadProduct(slug: string) {
  return prisma.product.findFirst({
    where: { slug, status: "APPROVED" },
    include: {
      vendor: {
        select: {
          storeName: true,
          slug: true,
          userId: true,
          user: { select: { name: true } },
        },
      },
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

  const session = await auth();
  const isVendorOfThisProduct =
    session?.user?.id !== undefined && session.user.id === product.vendor.userId;
  const showChat = !!session?.user && !isVendorOfThisProduct;

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
          vendor: { storeName: product.vendor.storeName, slug: product.vendor.slug },
          variants: product.variants,
        }}
      />

      {showChat && session?.user && (
        <div className="mt-12 max-w-2xl">
          <ProductChatPanel
            productId={product.id}
            currentUserId={session.user.id}
            vendorUserId={product.vendor.userId}
            vendorDisplayName={product.vendor.user.name ?? product.vendor.storeName}
          />
        </div>
      )}

      {isVendorOfThisProduct && (
        <div className="mt-12 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
          You&apos;re viewing your own product. Customer messages about this listing
          appear in your{" "}
          <Link
            href="/vendor/messages"
            className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
          >
            vendor inbox
          </Link>
          .
        </div>
      )}
    </div>
  );
}
