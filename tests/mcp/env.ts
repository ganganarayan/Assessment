/**
 * Test-only environment fallbacks, imported FIRST by every MCP test.
 *
 * src/lib/env.ts validates the boot variables on import. Unit tests need none of them for
 * real, so harmless placeholders are filled in only where a variable is missing. Nothing
 * here is a real secret, and a real value already in the environment is never replaced.
 */
const fallback: Record<string, string> = {
  DATABASE_URL: "postgresql://unit:unit@127.0.0.1:5/unit",
  BETTER_AUTH_SECRET: "unit-test-secret-not-real-0000000000",
  BETTER_AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};
for (const [k, v] of Object.entries(fallback)) {
  if (!process.env[k]) process.env[k] = v;
}

// Railway's internal Postgres host only resolves inside Railway; use the public proxy.
const current = process.env.DATABASE_URL ?? "";
if (process.env.DATABASE_PUBLIC_URL && /\.railway\.internal[:/]/.test(current)) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}


// Inside Next.js, next/navigation resolves to its react-server build. Plain Node (tsx) gets
// the browser build, which calls React.createContext and dies under the react-server
// condition. Point it at the same server build the app runs with.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module") as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const resolve = Module._resolveFilename;
Module._resolveFilename = function (req: string, ...rest: unknown[]) {
  if (req === "next/navigation") req = "next/dist/client/components/navigation.react-server";
  return resolve.call(this, req, ...rest);
};

export {};
