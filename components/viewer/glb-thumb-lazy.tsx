"use client";

import dynamic from "next/dynamic";
import { Box } from "lucide-react";

const GlbThumb = dynamic(
  () => import("./glb-thumb").then((m) => m.GlbThumb),
  { ssr: false, loading: () => <ThumbPlaceholder /> },
);

function ThumbPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-200 text-zinc-400 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950">
      <Box className="h-7 w-7 animate-pulse" strokeWidth={1.5} />
    </div>
  );
}

export function GlbThumbLazy({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  return <GlbThumb src={src} className={className} />;
}
