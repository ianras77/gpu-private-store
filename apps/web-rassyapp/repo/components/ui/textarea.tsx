import * as React from "react";
import { cn } from "@/lib/utils";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[120px] w-full rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-3 text-sm text-ink-50",
          "placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-glow-500/60",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
