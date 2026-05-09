import React, { createContext, useContext } from "react";
import { View } from "react-native";
import type { BrandConfig } from "@astro/brands";

const ThemeContext = createContext<BrandConfig | null>(null);

export const BrandThemeProvider: React.FC<{
  brand: BrandConfig;
  children: React.ReactNode;
}> = ({ brand, children }) => {
  return (
    <ThemeContext.Provider value={brand}>
      <View style={{ flex: 1, backgroundColor: brand.tokens.background }}>{children}</View>
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

export const brandCssVars = (_brand: BrandConfig): Record<string, string> => ({});
