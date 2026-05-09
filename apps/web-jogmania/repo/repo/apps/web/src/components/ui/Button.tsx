import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { buttonStyles } from "@/components/ui/buttonStyles";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={clsx(buttonStyles(variant, size), className)} {...props} />;
}
