/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3457/api/:path*',
      },
      {
        source: '/health',
        destination: 'http://localhost:3457/health',
      },
    ];
  },
};

module.exports = nextConfig;
