/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Flask served these at root (/health, /ping) with no /api prefix.
    // Next.js Pages Router can only emit JSON routes under pages/api/, so
    // restore the original paths via a rewrite instead of moving callers.
    return [
      { source: '/health', destination: '/api/health' },
      { source: '/ping', destination: '/api/ping' },
    ];
  },
};

module.exports = nextConfig;
