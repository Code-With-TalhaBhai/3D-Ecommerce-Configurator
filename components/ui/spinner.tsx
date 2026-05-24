import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const sizeStyles: Record<Size, string> = {
  xs: "h-3 w-3 border-[1.5px]",
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-8 w-8 border-[2.5px]",
  xl: "h-12 w-12 border-[3px]",
};

type SpinnerProps = {
  size?: Size;
  className?: string;
  label?: string;
};

export function Spinner({ size = "md", className, label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block animate-spin rounded-full border-current border-r-transparent border-b-transparent align-middle text-zinc-400 motion-reduce:animate-[spin_2s_linear_infinite] dark:text-zinc-500",
        sizeStyles[size],
        className,
      )}
    />
  );
}
