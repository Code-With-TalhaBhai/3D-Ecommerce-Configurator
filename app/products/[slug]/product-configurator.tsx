"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { addItem } from "@/store/slices/cartSlice";
import { resetVariant, setVariant } from "@/store/slices/viewerSlice";

const ConfigurableViewer = dynamic(
  () => import("@/components/viewer/configurable-viewer").then((m) => m.ConfigurableViewer),
  { ssr: false, loading: () => <ViewerSkeleton message="Loading 3D viewer…" /> },
);

const ControlsPanel = dynamic(
  () => import("@/components/viewer/controls-panel").then((m) => m.ControlsPanel),
  { ssr: false },
);

type Variant = {
  id: string;
  color: string | null;
  material: string | null;
  textureUrl: string | null;
};

type Product = {
  id: string;
  title: string;
  description: string;
  price: string;
  stock: number;
  glbUrl: string | null;
  thumbnailUrl: string | null;
  polyCount: number | null;
  fileSize: number | null;
  vendor: { storeName: string; slug: string };
  variants: Variant[];
};

function formatBytes(n: number | null) {
  if (!n) return null;
  const mb = n / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;
}

function variantLabel(v: Variant, fallbackIndex: number) {
  return v.material ?? v.color ?? `Variant ${fallbackIndex + 1}`;
}

export function ProductConfigurator({ product }: { product: Product }) {
  const dispatch = useAppDispatch();
  const cartItems = useAppSelector((s) => s.cart.items);
  const activeVariantId = useAppSelector((s) => s.viewer.variantId);

  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [slowConnection, setSlowConnection] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const screenshotterRef = useRef<(() => string | null) | null>(null);

  // Reset viewer state when navigating between products.
  useEffect(() => {
    dispatch(resetVariant());
    return () => {
      dispatch(resetVariant());
    };
  }, [dispatch, product.id]);

  useEffect(() => {
    type ConnInfo = { effectiveType?: string; saveData?: boolean };
    const nav = navigator as Navigator & { connection?: ConnInfo };
    const conn = nav.connection;
    if (!conn) return;
    const slow = conn.saveData === true || ["slow-2g", "2g", "3g"].includes(conn.effectiveType ?? "");
    setSlowConnection(slow);
  }, []);

  const mountedAt = useMemo(() => performance.now(), []);
  function handleFirstFrame() {
    const elapsed = performance.now() - mountedAt;
    setRenderMs(elapsed);
    if (process.env.NODE_ENV === "development") {
      console.info(`[viewer] first frame in ${elapsed.toFixed(0)} ms`);
    }
  }

  const onScreenshotterReady = useCallback((fn: () => string | null) => {
    screenshotterRef.current = fn;
  }, []);

  const takeScreenshot = useCallback(() => {
    return screenshotterRef.current?.() ?? null;
  }, []);

  function selectVariant(v: Variant | null) {
    if (!v) {
      dispatch(setVariant({ variantId: null, color: null, material: null, textureUrl: null }));
      return;
    }
    dispatch(
      setVariant({
        variantId: v.id,
        color: v.color,
        material: v.material,
        textureUrl: v.textureUrl,
      }),
    );
  }

  function onAddToCart() {
    dispatch(
      addItem({
        productId: product.id,
        vendorId: product.vendor.slug,
        title: product.title,
        price: Number(product.price),
        thumbnailUrl: product.thumbnailUrl,
        quantity: 1,
        variantId: activeVariantId ?? undefined,
      }),
    );
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1800);
  }

  const inCartQty = useMemo(() => {
    return cartItems
      .filter((i) => i.productId === product.id)
      .reduce((sum, i) => sum + i.quantity, 0);
  }, [cartItems, product.id]);

  const outOfStock = product.stock <= 0;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr,1fr]">
      <div className="flex flex-col gap-3">
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 sm:aspect-[4/3] lg:aspect-square">
          {product.glbUrl ? (
            <ConfigurableViewer
              src={product.glbUrl}
              className="h-full w-full"
              onFirstFrame={handleFirstFrame}
              onScreenshotterReady={onScreenshotterReady}
            />
          ) : (
            <ViewerSkeleton message="3D model unavailable" />
          )}

          {slowConnection && (
            <div className="absolute left-3 top-3 rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900 dark:bg-amber-900/70 dark:text-amber-100">
              Slow connection detected — model may take a moment.
            </div>
          )}

          {renderMs !== null && process.env.NODE_ENV === "development" && (
            <div className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 font-mono text-[10px] text-white">
              first frame: {renderMs.toFixed(0)} ms
            </div>
          )}
        </div>

        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          Drag to rotate · scroll to zoom · right-click and drag to pan
        </p>

        {/* On large screens the controls panel sits under the viewer. */}
        {product.glbUrl && (
          <div className="hidden lg:block">
            <ControlsPanel
              takeScreenshot={takeScreenshot}
              productTitle={product.title}
            />
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {product.vendor.storeName}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {product.title}
          </h1>
          <p className="mt-2 text-2xl font-medium text-zinc-900 dark:text-zinc-100">
            ${product.price}
          </p>
        </div>

        {product.variants.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Vendor variants
            </h2>
            <div className="flex flex-wrap gap-2">
              <VariantChip
                active={activeVariantId === null}
                onClick={() => selectVariant(null)}
                label="Default"
              />
              {product.variants.map((v, i) => (
                <VariantChip
                  key={v.id}
                  active={activeVariantId === v.id}
                  onClick={() => selectVariant(v)}
                  label={variantLabel(v, i)}
                  swatch={v.color}
                  texture={v.textureUrl}
                />
              ))}
            </div>
          </div>
        )}

        {/* On small screens the controls panel lives in the aside (below the variant chips). */}
        {product.glbUrl && (
          <div className="lg:hidden">
            <ControlsPanel takeScreenshot={takeScreenshot} productTitle={product.title} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button onClick={onAddToCart} disabled={outOfStock} size="lg">
            {justAdded ? (
              <>
                <Check className="h-4 w-4" /> Added to cart
              </>
            ) : outOfStock ? (
              "Out of stock"
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" /> Add to cart
              </>
            )}
          </Button>
          {inCartQty > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {inCartQty} in your cart
            </p>
          )}
        </div>

        <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            About this product
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
            {product.description}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Stock</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-100">{product.stock}</dd>
          </div>
          {product.polyCount !== null && (
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Triangles</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                {product.polyCount.toLocaleString()}
              </dd>
            </div>
          )}
          {formatBytes(product.fileSize) && (
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Model size</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                {formatBytes(product.fileSize)}
              </dd>
            </div>
          )}
          {product.variants.length > 0 && (
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Variants</dt>
              <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                {product.variants.length}
              </dd>
            </div>
          )}
        </dl>
      </aside>
    </div>
  );
}

function VariantChip({
  active,
  onClick,
  label,
  swatch,
  texture,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  swatch?: string | null;
  texture?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500",
      )}
    >
      {(swatch || texture) && (
        <span
          className="h-4 w-4 shrink-0 rounded-full border border-black/10 bg-cover bg-center dark:border-white/20"
          style={{
            backgroundColor: swatch ?? undefined,
            backgroundImage: texture ? `url(${texture})` : undefined,
          }}
        />
      )}
      <span>{label}</span>
    </button>
  );
}

function ViewerSkeleton({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-zinc-400">
      {message}
    </div>
  );
}
