import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aurora focus-visible:ring-offset-2 focus-visible:ring-offset-[#12031f] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[linear-gradient(120deg,var(--accent),var(--accent-2),var(--accent-3))] text-ink shadow-[0_0_18px_rgba(255,79,216,0.45)] hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(66,245,255,0.6)]",
        secondary:
          "border border-white/30 bg-white/10 text-white/90 shadow-[0_10px_30px_rgba(0,0,0,0.18)] hover:-translate-y-0.5 hover:border-white/60 hover:bg-white/20 hover:text-white",
        ghost:
          "border border-white/10 bg-white/[0.03] text-white/78 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
      }
    },
    defaultVariants: {
      variant: "primary"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant }), className)} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
