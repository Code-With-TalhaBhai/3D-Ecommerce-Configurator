"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";

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
  rejectionReason: string | null;
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
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Admin verbs depend on current status:
  //   PENDING  → Approve / Reject (initial review)
  //   APPROVED → Revoke (take a live listing down with a reason)
  //   REJECTED → Restore (put it back up, clears the rejection reason)
  // All three statuses use the same two server actions under the hood
  // (approveProduct + rejectProduct); only the labels change.
  const isApproved = product.status === "APPROVED";
  const isRejected = product.status === "REJECTED";
  const isPending = product.status === "PENDING";
  const negativeVerb = isApproved ? "Revoke" : "Reject";

  function onApprove() {
    setError(null);
    const fd = new FormData();
    fd.set("id", product.id);
    startTransition(async () => {
      await approveProduct(fd);
    });
  }

  function onReject() {
    setError(null);
    const fd = new FormData();
    fd.set("id", product.id);
    fd.set("reason", reason);
    startTransition(async () => {
      const result = await rejectProduct(fd);
      if (!result.ok) setError(result.error);
      else {
        setRejecting(false);
        setReason("");
      }
    });
  }

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

        {isRejected && product.rejectionReason && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <span className="font-medium">Reason:</span> {product.rejectionReason}
          </div>
        )}

        {isApproved && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            Live on the marketplace. Revoke if it needs to come down.
          </div>
        )}

        {rejecting ? (
          <div className="flex flex-col gap-2 pt-1">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              minLength={5}
              placeholder={
                isApproved
                  ? "Why is this being taken down? Vendors see this note."
                  : "Why is this being rejected? Vendors see this note."
              }
              disabled={pending}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                onClick={onReject}
                disabled={reason.trim().length < 5 || pending}
                className="flex-1"
              >
                {negativeVerb} with note
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setRejecting(false);
                  setError(null);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : isPending ? (
          <div className="flex gap-2 pt-1">
            <Button type="button" onClick={onApprove} disabled={pending} className="flex-1">
              Approve
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setRejecting(true)}
              disabled={pending}
              className="flex-1"
            >
              Reject…
            </Button>
          </div>
        ) : isApproved ? (
          <div className="pt-1">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setRejecting(true)}
              disabled={pending}
              className="w-full"
            >
              Revoke…
            </Button>
          </div>
        ) : (
          // REJECTED — offer to restore (re-approve, clears the reason).
          <div className="pt-1">
            <Button
              type="button"
              onClick={onApprove}
              disabled={pending}
              className="w-full"
            >
              Restore (approve)
            </Button>
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
