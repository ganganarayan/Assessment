import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        // Always readable: themed background + foreground text (works in light
        // AND dark). caret-color keeps the cursor visible while typing.
        "flex h-10 w-full rounded-md border border-cyan-500 bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] caret-[var(--foreground)]",
        "placeholder:text-[var(--muted-foreground)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
