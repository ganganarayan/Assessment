import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope } from "@/lib/tenant/acting";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";

/**
 * Serialise "count, then create" per workspace (Phase 2 of the multi-tenant review).
 *
 * 🔴 THE RACE. Every plan cap (funnels, seats, ad accounts, domains, client workspaces)
 * counted the existing rows and then created one, with nothing in between to stop a
 * second request doing the same. Two clicks at once, or two tabs, both counted "1 of 2"
 * and both created: a Gate workspace with three funnels, a single-seat plan with two
 * logins. Nothing ever looked again.
 *
 * The fix is a Postgres advisory lock held for the length of the action, keyed by the
 * workspace and the kind of thing being capped. The second request waits for the first
 * to finish, then counts what the first one created. Different workspaces, and different
 * kinds in one workspace, never wait on each other.
 *
 * The action runs on the global client, not inside the lock's transaction, so none of
 * the wrapped actions had to change: the lock only has to be HELD until the action's own
 * writes have committed, and they commit before this transaction ends.
 *
 * Re-entrant: an action already holding a kind's lock (the guided setup importing a
 * template, which is itself a capped action) runs straight through instead of waiting
 * on itself until the timeout.
 */
export type CapKind = "assessments" | "seats" | "adAccounts" | "domains" | "agencyTenants";

const held = new AsyncLocalStorage<Set<string>>();

export async function withCapLock<T>(kind: CapKind, run: () => Promise<T>): Promise<T> {
  const tenantId = (await resolveActingScope()).tenantId;
  if (!isBusinessTenant(tenantId)) return run();
  const key = `cap:${kind}:${tenantId}`;
  const mine = held.getStore();
  if (mine?.has(key)) return run();
  const next = new Set(mine ?? []);
  next.add(key);
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      return held.run(next, run);
    },
    // An import of a large file is the slowest thing that runs under this.
    { timeout: 120_000, maxWait: 15_000 },
  );
}
