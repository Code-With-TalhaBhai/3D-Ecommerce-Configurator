import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toCdnUrl } from "@/lib/storage/cdn";
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
      ...(product.thumbnailUrl ? { images: [toCdnUrl(product.thumbnailUrl)!] } : {}),
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
    <div className="mx-auto max-w-7xl px-6 py-8">
      <nav className="mb-6">
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All products
        </Link>
      </nav>

      <ProductConfigurator
        product={{
          id: product.id,
          title: product.title,
          description: product.description,
          price: product.price.toString(),
          stock: product.stock,
          glbUrl: toCdnUrl(product.glbUrl),
          thumbnailUrl: toCdnUrl(product.thumbnailUrl),
          polyCount: product.polyCount,
          fileSize: product.fileSize,
          vendor: { storeName: product.vendor.storeName, slug: product.vendor.slug },
          variants: product.variants.map((v) => ({
            ...v,
            textureUrl: toCdnUrl(v.textureUrl),
          })),
        }}
      />

      {showChat && session?.user && (
        <div className="mt-14 max-w-2xl">
          <ProductChatPanel
            productId={product.id}
            currentUserId={session.user.id}
            vendorUserId={product.vendor.userId}
            vendorDisplayName={product.vendor.user.name ?? product.vendor.storeName}
          />
        </div>
      )}

      {isVendorOfThisProduct && (
        <div className="mt-14 flex items-start gap-3 rounded-2xl border border-zinc-200/80 bg-white/60 p-5 text-sm shadow-sm shadow-zinc-900/[0.03] dark:border-zinc-800/80 dark:bg-zinc-900/40 dark:shadow-none">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            <Info className="h-4 w-4" />
          </span>
          <p className="text-zinc-600 dark:text-zinc-400">
            You&apos;re viewing your own product. Customer messages about this listing appear in your{" "}
            <Link
              href="/vendor/messages"
              className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
            >
              vendor inbox
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
