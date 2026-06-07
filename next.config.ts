import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Allow custom tenant domains to invoke Server Actions.
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") ?? [],
    },
  },
};

export default nextConfig;
