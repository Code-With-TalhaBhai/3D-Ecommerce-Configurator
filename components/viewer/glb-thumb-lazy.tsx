"use client";

import dynamic from "next/dynamic";

const GlbThumb = dynamic(
  () => import("./glb-thumb").then((m) => m.GlbThumb),
  { ssr: false, loading: () => <ThumbPlaceholder /> },
);

function ThumbPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-[10px] uppercase tracking-wider text-zinc-400 dark:from-zinc-800 dark:to-zinc-900">
      3D
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
