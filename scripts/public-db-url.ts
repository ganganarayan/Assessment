/**
 * Point break-glass scripts at Railway's PUBLIC Postgres proxy.
 *
 * `railway run` injects the Postgres service's DATABASE_URL, whose host is
 * postgres.railway.internal - that name only resolves INSIDE Railway's private
 * network, so running a script from a laptop dies with "Can't reach database
 * server at postgres.railway.internal:5432". Railway also publishes
 * DATABASE_PUBLIC_URL for the same database, routed through its TCP proxy,
 * which IS reachable from anywhere.
 *
 * Import this FIRST - ahead of anything that constructs a PrismaClient, since
 * Prisma reads the datasource URL when the client is built.
 *
 * Deliberately limited to the human-run recovery scripts. The Railway crons
 * (cron:webhooks, cron:abandoned) run inside the network where the internal
 * host is correct and free; sending them through the public proxy would be
 * slower and billed as egress.
 */
const current = process.env.DATABASE_URL ?? "";
const publicUrl = process.env.DATABASE_PUBLIC_URL;

if (publicUrl && /\.railway\.internal[:/]/.test(current)) {
  process.env.DATABASE_URL = publicUrl;
  console.log(
    "Using DATABASE_PUBLIC_URL - the internal host only resolves inside Railway.",
  );
}

// Marks this as an ES module so it can be `await import()`ed as well as imported for
// its side effect. No behaviour of its own; the swap above is the whole file.
export {};
