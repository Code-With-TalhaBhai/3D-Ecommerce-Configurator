import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-zinc-900 text-white shadow-sm shadow-zinc-900/10 hover:bg-zinc-800 active:bg-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:shadow-none dark:hover:bg-white",
  secondary:
    "border border-zinc-200 bg-white text-zinc-900 shadow-sm shadow-zinc-900/[0.03] hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-none dark:hover:border-zinc-700 dark:hover:bg-zinc-800",
  outline:
    "border border-zinc-200 bg-transparent text-zinc-900 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-900",
  ghost:
    "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
  destructive:
    "bg-red-600 text-white shadow-sm shadow-red-900/15 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-sm",
  icon: "h-9 w-9 p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium tracking-tight whitespace-nowrap",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-100 dark:focus-visible:ring-offset-zinc-950",
        "disabled:pointer-events-none disabled:opacity-50",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
