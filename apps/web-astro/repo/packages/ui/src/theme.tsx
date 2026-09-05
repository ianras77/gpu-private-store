"use client";

import React, { createContext, useContext } from "react";
import type { BrandConfig } from "@astro/brands";
import { deriveTokens } from "./theme-utils";

const ThemeContext = createContext<BrandConfig | null>(null);

type CssVarMap = Record<string, string>;

const buildCssVars = (brand: BrandConfig): CssVarMap => {
  const derived = deriveTokens(brand.tokens);
  return {
    "--color-bg": brand.tokens.background,
    "--color-text": brand.tokens.text,
    "--color-accent": brand.tokens.accent,
    "--color-accent-strong": derived.accentStrong,
    "--color-accent-soft": derived.accentSoft,
    "--color-muted": brand.tokens.muted,
    "--color-muted-soft": derived.mutedSoft,
    "--color-border": brand.tokens.border,
    "--color-border-soft": derived.borderSoft,
    "--color-surface": derived.surface,
    "--color-surface-strong": derived.surfaceStrong,
    "--shadow-soft": derived.shadowSoft,
    "--shadow-lift": derived.shadowLift,
    "--font-body": brand.tokens.fontDisplay,
    "--font-display": brand.tokens.fontFamily,
    "--space-xs": brand.tokens.spacing.xs,
    "--space-sm": brand.tokens.spacing.sm,
    "--space-md": brand.tokens.spacing.md,
    "--space-lg": brand.tokens.spacing.lg,
    "--space-xl": brand.tokens.spacing.xl,
    "--radius-sm": brand.tokens.radius.sm,
    "--radius-md": brand.tokens.radius.md,
    "--radius-lg": brand.tokens.radius.lg
  };
};

export const BrandThemeProvider: React.FC<{
  brand: BrandConfig;
  children: React.ReactNode;
}> = ({ brand, children }) => {
  const vars = buildCssVars(brand);
  return (
    <ThemeContext.Provider value={brand}>
      <div style={vars as React.CSSProperties} data-brand-id={brand.id}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useBrand = (): BrandConfig => {
  const brand = useContext(ThemeContext);
  if (!brand) {
    throw new Error("BrandThemeProvider is missing in component tree.");
  }
  return brand;
};

export const brandCssVars = (brand: BrandConfig): React.CSSProperties =>
  buildCssVars(brand) as React.CSSProperties;
