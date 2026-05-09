/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@jogmania/api-client", "@jogmania/shared"]
};

export default nextConfig;
