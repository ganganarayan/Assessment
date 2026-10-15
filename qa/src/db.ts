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

/** Errors that are about the connection rather than about the query. */
const TRANSIENT = /connection pool|Can't reach database|server has closed|Closed|ECONNRESET|terminating connection|starting up/i;

/**
 * Retry a read that failed for connection reasons.
 *
 * Staging's Postgres restarts from time to time - the handover says so, and three
 * sweeps in one afternoon died on it. A harness that gives up on the first dropped
 * connection reports an infrastructure hiccup as a funnel failure, which is the one
 * thing it must never do. Three goes, backing off, and only for connection errors: a
 * query that is genuinely wrong still fails immediately.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, label = "a database read"): Promise<T> {
  // Railway's public TCP proxy goes away for a minute or two at a time - three sweeps
  // in one afternoon died on it, two of them after driving most of their cases. Five
  // goes backing off to half a minute covers an outage of about ninety seconds, which
  // is what these have actually lasted, and still fails fast on a query that is simply
  // wrong.
  const waits = [3, 6, 12, 30];
  let lastError: unknown;
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!TRANSIENT.test(message)) throw err;
      const wait = waits[attempt];
      if (wait === undefined) break;
      console.log(`  (${label} could not reach the database, trying again in ${wait}s)`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      await client?.$disconnect().catch(() => {});
      client = null;
    }
  }
  throw lastError;
}
