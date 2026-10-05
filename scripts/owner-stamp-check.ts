/**
 * The regression guard for the orphaned-row bug, as a pure source scan - NO DATABASE.
 *
 * THE BUG. A super admin with no workspace entered has `scope.tenantId === null`, so a
 * write that stamps it saves an UNOWNED row - while that same caller's reads are scoped
 * to the Platform tenant. Written as null, searched for as "platform". The row exists
 * and its public funnel serves fine, but the console can never find it again. That is
 * how "How much are you paying for junk leads?" disappeared the day it was created.
 *
 * `configTenantOf(scope)` returns a non-nullable id and is the correct stamp. TypeScript
 * cannot enforce the choice: the Prisma column is still nullable, and `scope.tenantId`
 * remains perfectly legitimate in a WHERE clause. So the guard is textual, and
 * deliberately narrow - it objects only to the nullable id being written as a row's
 * OWNER, never to it being used as a filter.
 *
 * WHY IT LIVES IN ITS OWN FILE, free of any database import: it started inside
 * `verify:tenancy`, which connects to Postgres, so it could only run when someone
 * deliberately pointed a script at an environment. A guard that runs almost never is
 * decoration. Standing alone it needs nothing, so it runs in the build - which is the
 * only place that sees every change before it reaches production.
 *
 * DELETE THIS once the tenant columns are NOT NULL. At that point Postgres refuses the
 * write itself, which beats reading source for a living.
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/** `data:` / `create:` blocks that stamp the row owner from the nullable scope value. */
const BANNED = /(?:data|create):\s*\{[^}]*tenantId:\s*scope\.tenantId/s;

/** Absolute paths of source files that stamp an owner from the nullable id. */
export function findOwnerStampOffenders(root = join(process.cwd(), "src")): string[] {
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name) && BANNED.test(readFileSync(full, "utf8"))) offenders.push(full);
    }
  };
  walk(root);
  return offenders;
}

/** What to tell a developer who just tripped it. */
export function ownerStampAdvice(offenders: string[]): string {
  return (
    `Stamp the row owner with configTenantOf(scope), not scope.tenantId:\n` +
    offenders.map((f) => `  - ${f}`).join("\n") +
    `\n\nscope.tenantId is null for a super admin with no workspace entered, so the row is\n` +
    `saved unowned and vanishes from a console that scopes reads to the Platform tenant.`
  );
}
