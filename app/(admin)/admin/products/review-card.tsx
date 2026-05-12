"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { approveProduct, rejectProduct } from "./actions";

const GlbViewer = dynamic(
  () => import("@/components/viewer/glb-viewer").then((m) => m.GlbViewer),
  { ssr: false, loading: () => <ViewerSkeleton message="Loading viewer…" /> },
);

type Product = {
  id: string;
  title: string;
  description: string;
  price: string;
  stock: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  glbUrl: string | null;
  polyCount: number | null;
  fileSize: number | null;
  createdAt: string;
  vendor: { storeName: string; slug: string };
};

function formatBytes(n: number | null) {
  if (!n) return "—";
  const mb = n / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;
}

export function ReviewCard({ product }: { product: Product }) {
  const [showViewer, setShowViewer] = useState(false);

  return (
    <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="aspect-video bg-zinc-50 dark:bg-zinc-950">
        {showViewer && product.glbUrl ? (
          <GlbViewer src={product.glbUrl} className="h-full w-full" />
        ) : (
          <button
            type="button"
            onClick={() => setShowViewer(true)}
            disabled={!product.glbUrl}
            className="flex h-full w-full items-center justify-center text-sm text-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {product.glbUrl ? "Load 3D preview" : "No GLB attached"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {product.title}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              by {product.vendor.storeName}
            </p>
          </div>
          <div className="text-right text-sm">
            <div className="font-medium text-zinc-900 dark:text-zinc-100">
              ${product.price}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              stock {product.stock}
            </div>
          </div>
        </div>

        <p className="line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
          {product.description}
        </p>

        <dl className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Triangles</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-100">
              {product.polyCount?.toLocaleString() ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Compressed size</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-100">
              {formatBytes(product.fileSize)}
            </dd>
          </div>
        </dl>

        {product.status === "PENDING" ? (
          <div className="flex gap-2 pt-1">
            <form action={approveProduct} className="flex-1">
              <input type="hidden" name="id" value={product.id} />
              <Button type="submit" className="w-full">
                Approve
              </Button>
            </form>
            <form action={rejectProduct} className="flex-1">
              <input type="hidden" name="id" value={product.id} />
              <Button type="submit" variant="destructive" className="w-full">
                Reject
              </Button>
            </form>
          </div>
        ) : (
          <div className="pt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Status: <span className="font-medium">{product.status}</span>
          </div>
        )}
      </div>
    </article>
  );
}

function ViewerSkeleton({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
      {message}
    </div>
  );
}
