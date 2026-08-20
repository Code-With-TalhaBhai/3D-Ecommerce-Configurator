"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { ScanLine } from "lucide-react";
import { isMobileDevice } from "@/lib/viewer/is-mobile-device";

const ARViewer = dynamic(() => import("@/components/viewer/ar-viewer").then((m) => m.ARViewer), { ssr: false });
const TryOnViewer = dynamic(() => import("@/components/viewer/tryon/tryon-viewer").then((m) => m.TryOnViewer), {
  ssr: false,
});

type Category = { tryOnAnchor: "WRIST" | "FOOT" | null };

/**
 * Single AR integration point for the product detail page. Resolves to
 * exactly one primary mode based on the product's category — never both
 * offered up front:
 *   - category.tryOnAnchor set (WRIST/FOOT) → "Try On" (camera-landmark
 *     virtual try-on, gated on getUserMedia support AND a mobile-device
 *     check — desktop/laptop webcams pass getUserMedia too, but try-on
 *     only makes sense worn against a body via a handheld rear camera)
 *   - category.tryOnAnchor null → "Place In Room" (existing WebXR flow,
 *     gated on navigator.xr immersive-ar support, unchanged behavior)
 *
 * The one place the two can coexist: if try-on's camera permission is
 * denied and this device also supports WebXR, TryOnViewer surfaces an
 * explicit "Use Room Placement instead" escape hatch, which flips `mode`
 * without closing the overlay.
 */
export function ARLauncher({
  product,
  modelReady,
  open,
  onOpenChange,
}: {
  product: { glbUrl: string | null; category: Category };
  modelReady: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tryOnAnchor = product.category.tryOnAnchor;
  const glbUrl = product.glbUrl;

  const [cameraSupported, setCameraSupported] = useState(false);
  const [mobileDevice, setMobileDevice] = useState(false);
  const [xrSupported, setXrSupported] = useState(false);

  const primaryMode: "tryon" | "room" = tryOnAnchor ? "tryon" : "room";
  const [mode, setMode] = useState<"tryon" | "room">(primaryMode);

  useEffect(() => {
    setMode(primaryMode);
  }, [primaryMode]);

  useEffect(() => {
    setCameraSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
    setMobileDevice(isMobileDevice());
  }, []);

  // Always probed, even when the category is try-on — this is the only
  // signal that decides whether TryOnViewer's camera-denied fallback can
  // offer Room Placement as an escape hatch.
  useEffect(() => {
    let cancelled = false;
    if (process.env.NODE_ENV === "development" && !navigator.xr && !window.isSecureContext) {
      // The #1 reason "Place In Room" doesn't show up when testing on a
      // phone: WebXR requires a secure context, so navigator.xr is
      // undefined on a plain http://<lan-ip>:3000 dev URL. Use the
      // "unsafely-treat-insecure-origin-as-secure" chrome://flags override
      // (Android) or `next dev --experimental-https` to test AR locally.
      console.info(
        '[AR] navigator.xr is unavailable on this insecure origin — the "Place In Room" button will stay hidden until this page is served over HTTPS (or localhost).',
      );
    }
    navigator.xr
      ?.isSessionSupported("immersive-ar")
      .then((supported) => {
        if (!cancelled) setXrSupported(supported);
      })
      .catch(() => {
        if (!cancelled) setXrSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!glbUrl) return null;

  const canShowButton =
    modelReady && !open && (primaryMode === "tryon" ? cameraSupported && mobileDevice : xrSupported);

  return (
    <>
      {canShowButton && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-zinc-800 shadow-sm backdrop-blur hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-700/60 dark:bg-zinc-900/90 dark:text-zinc-100"
        >
          <ScanLine className="h-3.5 w-3.5" />
          {primaryMode === "tryon" ? "Try On" : "Place In Room"}
        </button>
      )}

      {open &&
        createPortal(
          mode === "tryon" ? (
            <TryOnViewer
              src={glbUrl}
              anchor={tryOnAnchor === "FOOT" ? "foot" : "wrist"}
              onClose={() => onOpenChange(false)}
              onFallbackToRoom={xrSupported ? () => setMode("room") : undefined}
            />
          ) : (
            <ARViewer src={glbUrl} onClose={() => onOpenChange(false)} />
          ),
          document.body,
        )}
    </>
  );
}
