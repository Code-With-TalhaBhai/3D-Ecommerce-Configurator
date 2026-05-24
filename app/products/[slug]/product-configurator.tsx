"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Layers, MousePointer2, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { addItem } from "@/store/slices/cartSlice";
import { resetVariant, setVariant } from "@/store/slices/viewerSlice";

const ConfigurableViewer = dynamic(
  () => import("@/components/viewer/configurable-viewer").then((m) => m.ConfigurableViewer),
  {
    ssr: false,
    // Same loader as the post-mount overlay, so the user sees one continuous
    // animation across the JS-chunk-loading and GLB-fetching phases instead
    // of two visually different placeholders flashing in sequence.
    loading: () => <ViewerLoader label="Loading viewer" hint="Preparing the renderer" />,
  },
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
  // `modelReady` flips when ConfigurableViewer signals onFirstFrame.
  // `showLoader` stays true through a 350 ms fade-out window after that, so
  // the loader gets a clean transition rather than disappearing instantly.
  const [modelReady, setModelReady] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const screenshotterRef = useRef<(() => string | null) | null>(null);

  useEffect(() => {
    dispatch(resetVariant());
    // Re-arm the loader whenever the user navigates to a different product —
    // the new GLB has to be fetched & parsed from scratch.
    setModelReady(false);
    setShowLoader(true);
    setRenderMs(null);
    return () => {
      dispatch(resetVariant());
    };
  }, [dispatch, product.id]);

  // After the first frame fires, fade the loader out and unmount it once the
  // CSS transition completes. 350 ms ≥ the 300 ms transition duration so the
  // unmount happens cleanly after the fade lands.
  useEffect(() => {
    if (!modelReady) return;
    const t = setTimeout(() => setShowLoader(false), 350);
    return () => clearTimeout(t);
  }, [modelReady]);

  useEffect(() => {
    type ConnInfo = { effectiveType?: string; saveData?: boolean };
    const nav = navigator as Navigator & { connection?: ConnInfo };
    const conn = nav.connection;
    if (!conn) return;
    const slow = conn.saveData === true || ["slow-2g", "2g", "3g"].includes(conn.effectiveType ?? "");
    setSlowConnection(slow);
  }, []);

  // Reset on every product change so renderMs reflects the current model's
  // load time, not the first product the user happened to land on.
  const mountedAt = useMemo(() => performance.now(), [product.id]);
  function handleFirstFrame() {
    const elapsed = performance.now() - mountedAt;
    setRenderMs(elapsed);
    setModelReady(true);
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
  const lowStock = !outOfStock && product.stock <= 5;

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[3fr_2fr] lg:gap-10">
      {/* Viewer — sticky on lg+ so customizations reflect without scrolling */}
      <div className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-zinc-200/80 bg-gradient-to-br from-zinc-50 via-white to-zinc-100 shadow-sm shadow-zinc-900/[0.04] dark:border-zinc-800/80 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 dark:shadow-none lg:aspect-[4/3] lg:max-h-[calc(100dvh-7rem)]">
          {product.glbUrl ? (
            <ConfigurableViewer
              src={product.glbUrl}
              className="h-full w-full"
              onFirstFrame={handleFirstFrame}
              onScreenshotterReady={onScreenshotterReady}
            />
          ) : (
            <ViewerLoader label="3D model unavailable" />
          )}

          {product.glbUrl && showLoader && (
            <div
              aria-live="polite"
              className={cn(
                "absolute inset-0 z-10 transition-opacity duration-300 ease-out",
                modelReady ? "pointer-events-none opacity-0" : "opacity-100",
              )}
            >
              <ViewerLoader
                label="Preparing 3D model"
                hint={slowConnection ? "Slow connection — this may take a moment" : "Downloading and rendering"}
              />
            </div>
          )}

          {slowConnection && modelReady && (
            <div className="absolute left-3 top-3 rounded-full border border-amber-200/80 bg-amber-50/95 px-3 py-1 text-[11px] font-medium text-amber-900 shadow-sm backdrop-blur dark:border-amber-700/40 dark:bg-amber-950/90 dark:text-amber-200">
              Slow connection — model may take a moment.
            </div>
          )}

          {renderMs !== null && process.env.NODE_ENV === "development" && (
            <div className="absolute bottom-3 right-3 rounded-md bg-black/65 px-2 py-1 font-mono text-[10px] text-white">
              first frame: {renderMs.toFixed(0)} ms
            </div>
          )}
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
          <MousePointer2 className="h-3 w-3" />
          Drag to rotate · scroll to zoom · right-click to pan
        </p>
      </div>

      <aside className="flex flex-col gap-7">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            {product.vendor.storeName}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-zinc-900 sm:text-4xl dark:text-zinc-50">
            {product.title}
          </h1>
          <div className="mt-4 flex items-baseline gap-3">
            <p className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              ${product.price}
            </p>
            {outOfStock ? (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-900 dark:bg-red-900/40 dark:text-red-200">
                Out of stock
              </span>
            ) : lowStock ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                Only {product.stock} left
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
                In stock
              </span>
            )}
          </div>
        </div>

        {product.variants.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
              <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Vendor variants
              </h2>
            </div>
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

        {product.glbUrl && (
          <ControlsPanel takeScreenshot={takeScreenshot} productTitle={product.title} />
        )}

        <div className="flex flex-col gap-2">
          <Button onClick={onAddToCart} disabled={outOfStock} size="lg" className="w-full">
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
              {inCartQty} already in your cart
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-900/[0.03] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            About this product
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {product.description}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-200/80 text-xs dark:border-zinc-800/80 dark:bg-zinc-800/80 sm:grid-cols-4">
          <StatCell label="Stock" value={product.stock.toString()} />
          {product.polyCount !== null && (
            <StatCell label="Triangles" value={product.polyCount.toLocaleString()} />
          )}
          {formatBytes(product.fileSize) && (
            <StatCell label="Model size" value={formatBytes(product.fileSize)!} />
          )}
          {product.variants.length > 0 && (
            <StatCell label="Variants" value={product.variants.length.toString()} />
          )}
        </dl>
      </aside>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-4 dark:bg-zinc-900">
      <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100">
        {value}
      </dd>
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
        "group/chip flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium tracking-tight transition-all duration-150",
        active
          ? "border-zinc-900 bg-zinc-900 text-white shadow-sm shadow-zinc-900/20 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none"
          : "border-zinc-200 bg-white text-zinc-700 hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600",
      )}
    >
      {(swatch || texture) && (
        <span
          className="h-4 w-4 shrink-0 rounded-full border border-black/10 bg-cover bg-center shadow-inner dark:border-white/20"
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

/**
 * In-viewer loader. Same visual language as the global PageLoader (brand
 * glyph + rotating ring + animated dots) but scaled to fit a constrained
 * container and rendered against a soft gradient + backdrop blur so it
 * reads as an integrated part of the viewer frame, not a modal popping in.
 */
function ViewerLoader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-zinc-50/95 via-white/95 to-zinc-100/95 px-6 text-center backdrop-blur-sm dark:from-zinc-900/95 dark:via-zinc-900/95 dark:to-zinc-950/95"
    >
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 scale-[2.4] rounded-full bg-zinc-900/[0.04] blur-2xl dark:bg-zinc-100/[0.05]"
        />
        <span className="relative grid h-12 w-12 place-items-center rounded-xl bg-zinc-900 text-xs font-semibold tracking-tight text-white shadow-lg shadow-zinc-900/20 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none">
          3D
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-2.5 rounded-full border-[1.5px] border-zinc-900/10 border-t-zinc-900/70 animate-[spin_1.1s_linear_infinite] dark:border-zinc-100/10 dark:border-t-zinc-100/70"
        />
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <p className="text-sm font-medium tracking-tight text-zinc-700 dark:text-zinc-200">
          {label}
          <span className="ml-0.5 inline-flex">
            <span className="animate-[loader-dot_1.4s_ease-in-out_infinite]">.</span>
            <span className="animate-[loader-dot_1.4s_ease-in-out_infinite_200ms]">.</span>
            <span className="animate-[loader-dot_1.4s_ease-in-out_infinite_400ms]">.</span>
          </span>
        </p>
        {hint && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</p>}
      </div>
    </div>
  );
}
