/**
 * The harness's own Prisma client.
 *
 * It does NOT import the app's `@/lib/db/prisma`: that module pulls in the app's
 * validated env, which is complete inside Railway and deliberately incomplete on a
 * laptop, so importing it would make the harness fail for a reason that has nothing
 * to do with the funnel under test. The generated client itself resolves from the
 * repo's node_modules, so the schema is always the one the app runs on.
 */
import { PrismaClient } from "@prisma/client";
import { loadQaEnv } from "./env.js";

let client: PrismaClient | null = null;

export function db(): PrismaClient {
  if (client) return client;
  const { databaseUrl } = loadQaEnv();
  if (!databaseUrl) {
    throw new Error(
      "No database URL. Set QA_DATABASE_URL in qa/.env.qa (Railway's DATABASE_PUBLIC_URL for the Postgres service), or run the harness under `railway run`.",
    );
  }
  if (/\.railway\.internal[:/]/.test(databaseUrl)) {
    throw new Error(
      "The database URL points at postgres.railway.internal, which only resolves inside Railway. Use DATABASE_PUBLIC_URL instead.",
    );
  }
  client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  return client;
}

export async function closeDb(): Promise<void> {
  if (client) await client.$disconnect();
  client = null;
}
