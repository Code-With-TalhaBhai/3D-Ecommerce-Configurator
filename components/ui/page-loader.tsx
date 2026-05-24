import { cn } from "@/lib/utils";

type PageLoaderProps = {
  label?: string;
  hint?: string;
  className?: string;
  /** Use "fullscreen" when no surrounding chrome is rendered; "section" when nested inside a layout that already has a header. */
  variant?: "fullscreen" | "section";
};

export function PageLoader({
  label = "Loading",
  hint,
  className,
  variant = "section",
}: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative flex w-full flex-col items-center justify-center gap-5 px-6 text-center",
        variant === "fullscreen" ? "min-h-screen" : "min-h-[60vh]",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid-fade opacity-60"
      />

      <div className="relative">
        {/* Soft radial glow behind the badge */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 scale-[2.6] rounded-full bg-zinc-900/[0.04] blur-2xl dark:bg-zinc-100/[0.05]"
        />

        {/* Brand glyph */}
        <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-zinc-900 text-sm font-semibold tracking-tight text-white shadow-lg shadow-zinc-900/20 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-none">
          3D
        </span>

        {/* Concentric rotating ring */}
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-3 rounded-full border-[1.5px] border-zinc-900/10 border-t-zinc-900/70 animate-[spin_1.1s_linear_infinite] dark:border-zinc-100/10 dark:border-t-zinc-100/70"
        />
      </div>

      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-medium tracking-tight text-zinc-700 dark:text-zinc-200">
          {label}
          <span className="ml-0.5 inline-flex">
            <span className="animate-[loader-dot_1.4s_ease-in-out_infinite]">.</span>
            <span className="animate-[loader-dot_1.4s_ease-in-out_infinite_200ms]">.</span>
            <span className="animate-[loader-dot_1.4s_ease-in-out_infinite_400ms]">.</span>
          </span>
        </p>
        {hint && (
          <p className="max-w-sm text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
        )}
      </div>
    </div>
  );
}
