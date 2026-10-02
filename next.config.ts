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
      // The assessment builder saves the WHOLE assessment in one action: every question,
      // every option, the published page JSON, the gate config and the result-page blocks.
      // Next defaults this to 1 MB, and a mature assessment crosses it - at which point the
      // action is rejected before it runs, the save button sits on "Saving..." forever and
      // the page falls through to the error boundary with nothing useful on screen.
      // There is no partial save to fall back on, so the limit has to clear the largest
      // real assessment rather than the average one.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
