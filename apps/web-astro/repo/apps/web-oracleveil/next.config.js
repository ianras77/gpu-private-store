/** @type {import('next').NextConfig} */
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4020";

const nextConfig = {
  transpilePackages: ["@astro/ui", "@astro/brands"],
  experimental: { typedRoutes: false },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
