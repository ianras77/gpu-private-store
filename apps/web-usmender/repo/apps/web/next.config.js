/** @type {import('next').NextConfig} */
const apiInternalUrl = (process.env.API_INTERNAL_URL ?? 'http://localhost:3001').replace(
  /\/$/,
  ''
);

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiInternalUrl}/:path*`
      }
    ];
  }
};

export default nextConfig;
