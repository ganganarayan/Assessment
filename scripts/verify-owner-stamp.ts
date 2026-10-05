/**
 * verify:owner-stamp - runs in the BUILD, so an orphaning write can never ship.
 *
 * No database, no network, no env: a source scan and an exit code. See
 * owner-stamp-check.ts for what it looks for and why TypeScript cannot do this job yet.
 *
 *   npm run verify:owner-stamp
 */
import { findOwnerStampOffenders, ownerStampAdvice } from "./owner-stamp-check";

const offenders = findOwnerStampOffenders();

if (offenders.length === 0) {
  console.log("🟢 owner stamps: every create uses configTenantOf(scope).");
  process.exit(0);
}

console.error(`🔴 ${offenders.length} write(s) stamp a row's owner from the nullable scope.tenantId.\n`);
console.error(ownerStampAdvice(offenders));
process.exit(1);
