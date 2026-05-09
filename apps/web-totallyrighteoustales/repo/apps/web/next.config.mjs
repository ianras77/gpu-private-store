/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Uploaded story and avatar images can come from environment-specific object storage,
    // so we keep them unoptimized at the framework layer and render them directly.
    unoptimized: true
  },
  experimental: {
    // Typed routes generation is disabled to avoid build-time .next/types lookups that
    // exceed container file watch limits in this environment.
    typedRoutes: false
  }
};

export default nextConfig;
