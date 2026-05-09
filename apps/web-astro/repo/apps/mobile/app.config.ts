import { BRANDS } from "@astro/brands";

const brandId = (process.env.APP_BRAND as keyof typeof BRANDS) ?? "jupiterseek";
const brand = BRANDS[brandId];

export default ({ config }: any) => ({
  ...config,
  name: brand.name,
  slug: brandId,
  version: "1.0.0",
  orientation: "portrait",
  icon: `../../${brand.assets.icon}`,
  splash: {
    image: `../../${brand.assets.splash}`,
    resizeMode: "contain",
    backgroundColor: brand.tokens.background
  },
  ios: {
    bundleIdentifier: `com.astro.${brandId}`
  },
  extra: {
    brandId,
    apiBase: process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:4020"
  }
});
