import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900",
        "shadow-sm shadow-zinc-900/[0.02]",
        "transition-[border-color,box-shadow] duration-150",
        "placeholder:text-zinc-400",
        "focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-zinc-50",
        "dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-none",
        "dark:placeholder:text-zinc-500 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10",
        "dark:disabled:bg-zinc-900/50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
