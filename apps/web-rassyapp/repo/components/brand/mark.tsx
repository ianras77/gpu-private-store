import * as React from "react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-2xl bg-ink-50/10 blur-xl" />
        <div className="relative grid h-10 w-10 place-items-center rounded-2xl border border-ink-700 bg-ink-900">
          <svg viewBox="0 0 28 28" className="h-6 w-6 text-ink-50" fill="none">
            <path
              d="M14 4.5L15.4 7.7L18.8 8.1L16.2 10.4L17 13.7L14 11.9L11 13.7L11.8 10.4L9.2 8.1L12.6 7.7L14 4.5Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <rect x="5.5" y="13.5" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
            <rect x="15.5" y="13.5" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
            <rect x="10.5" y="20.5" width="7" height="4" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.4em] text-ink-400">
          Rassy Launchpad
        </div>
        <div className="text-lg font-semibold text-ink-50">Kid Game Studio</div>
      </div>
    </div>
  );
}
