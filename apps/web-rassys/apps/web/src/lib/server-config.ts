export const serverConfig = {
  RADIO_CONTROLLER_URL:
    process.env.RADIO_CONTROLLER_URL ??
    process.env.NEXT_PUBLIC_RADIO_API_URL ??
    "http://radio-controller:4000",
  MINECRAFT_BRIDGE_URL:
    process.env.MINECRAFT_BRIDGE_URL ??
    process.env.NEXT_PUBLIC_MINECRAFT_API_URL ??
    "http://minecraft-bridge:4100",
  ADMIN_USERNAME: process.env.ADMIN_USERNAME ?? "ian",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "",
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET ?? "",
  RADIO_ADMIN_API_KEY: process.env.RADIO_ADMIN_API_KEY ?? "",
  REDIS_URL: process.env.REDIS_URL ?? "redis://redis:6379"
};
