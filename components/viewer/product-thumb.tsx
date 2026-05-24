import { Box } from "lucide-react";

import { cn } from "@/lib/utils";

type ProductThumbProps = {
  /** Public URL of the saved PNG thumbnail (e.g. via toCdnUrl). null/undefined falls back to the placeholder. */
  src: string | null | undefined;
  alt: string;
  /** Tailwind classes applied to the outer container; should set width/height. */
  className?: string;
  /** Tailwind classes applied to the inner <img>. */
  imgClassName?: string;
};

/**
 * 2D product thumbnail. Renders the stored PNG when one exists, otherwise a
 * neutral icon placeholder. Pure HTML — no WebGL, no Three.js, no Suspense —
 * so listing pages that render dozens of these stay snappy.
 *
 * Live 3D viewing is reserved for the product detail page
 * (/products/[slug]), the vendor upload preview, and the admin review queue.
 */
export function ProductThumb({
  src,
  alt,
  className,
  imgClassName,
}: ProductThumbProps) {
  if (src) {
    return (
      <div className={cn("relative overflow-hidden", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(
            "h-full w-full object-cover transition-transform duration-300",
            imgClassName,
          )}
        />
      </div>
    );
  }
  return (
    <div
      aria-label={alt}
      role="img"
      className={cn(
        "flex items-center justify-center bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-200 text-zinc-400",
        "dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950 dark:text-zinc-600",
        className,
      )}
    >
      <Box className="h-7 w-7" strokeWidth={1.5} />
    </div>
  );
}
