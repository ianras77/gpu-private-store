import * as React from "react";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-xl border border-ink-700 bg-ink-900/60 px-4 text-sm text-ink-50",
          "placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-glow-500/60",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
