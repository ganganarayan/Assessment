import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "outline" | "success" | "muted";

const variants: Record<BadgeVariant, string> = {
  default: "bg-[var(--primary)] text-[var(--primary-foreground)]",
  outline: "border text-[var(--foreground)]",
  success: "bg-emerald-600 text-white",
  muted: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
