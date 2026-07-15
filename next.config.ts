import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Don't let webpack bundle Better Auth (and its Kysely adapter). The adapter
  // references node:sqlite, which webpack tries to bundle and fails on. Marking
  // it external means it's require()'d natively at runtime instead — fixing the
  // "Build failed because of webpack errors" from @better-auth/kysely-adapter.
  serverExternalPackages: [
    "better-auth",
    "@better-auth/kysely-adapter",
    "@prisma/client",
    "prisma",
    // react-pdf pulls in fontkit/yoga (native-ish); keep it out of the webpack bundle.
    "@react-pdf/renderer",
  ],
  experimental: {
    serverActions: {
      // Allow custom tenant domains to invoke Server Actions.
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") ?? [],
    },
  },
};

export default nextConfig;
