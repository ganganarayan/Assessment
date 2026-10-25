/**
 * verify:vault - runs in the BUILD, so a rewritten object key can never ship.
 *
 * 🔴 THE INVARIANT. VaultFile.objectKey is minted once, at upload, and nothing ever
 * changes it. Renaming a file and moving it between folders are database-only edits
 * precisely so that a link already pasted into VidaPulse, an LMS or a landing page
 * keeps resolving. The moment some future change "tidies up" by writing the folder
 * path into the key, every one of those embeds 404s - silently, on live pages, with
 * nothing in this app that knows it happened.
 *
 * TypeScript cannot express "this column is append-only", so this is a source scan and
 * an exit code. No database, no network, no env.
 *
 *   npm run verify:vault
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? ".";

/** Every .ts/.tsx file under src, flattened. */
function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      sources(full, out);
      continue;
    }
    if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * The substring from `open` at `from` to its MATCHING close, inclusive.
 *
 * Crude but adequate: it does not understand strings or comments, which is fine
 * because it is only ever pointed at an object literal in an argument list. Returns
 * null if the brackets never balance, and the caller then skips rather than guesses.
 */
function balanced(text: string, from: number, open: string, close: string): string | null {
  if (text[from] !== open) return null;
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return text.slice(from, i + 1);
    }
  }
  return null;
}

const problems: string[] = [];
const files = sources(join(root, "src"));

for (const file of files) {
  const text = readFileSync(file, "utf8");

  // 1. No update may write objectKey. The slice is generous rather than balanced -
  //    over-reading risks a false positive, which is the safe direction for a guard
  //    whose failure mode is a silent broken link in production.
  for (const m of text.matchAll(/prisma\.vaultFile\.update(?:Many)?\s*\(/g)) {
    // 🟡 BALANCED, not a fixed window. The first version read 700 characters after the
    // call and flagged anything containing objectKey - which started failing the build
    // the moment an activity-log call that legitimately RECORDS the key was written
    // just after an update. A guard that cries wolf gets switched off, so this reads
    // the update's own `data` block and nothing else.
    const callStart = (m.index ?? 0) + m[0].length - 1;
    const call = balanced(text, callStart, "(", ")");
    if (!call) continue;
    const dataAt = call.search(/\bdata\s*:\s*\{/);
    if (dataAt < 0) continue;
    const dataBlock = balanced(call, call.indexOf("{", dataAt), "{", "}");
    if (dataBlock && /\bobjectKey\s*:/.test(dataBlock)) {
      problems.push(
        `${file}: a vaultFile update writes objectKey in its data block. The key is immutable - renaming and moving are name/folder edits only.`,
      );
    }
  }

  // 2. Only keys.ts may build a key string. Anywhere else composing one is how a
  //    folder path ends up in a key again.
  if (!file.endsWith(join("features", "vault", "keys.ts"))) {
    if (/objectKey\s*:\s*`/.test(text)) {
      problems.push(
        `${file}: builds an objectKey from a template literal. Keys come from mintObjectKey() in features/vault/keys.ts, nowhere else.`,
      );
    }
  }
}

// 3. The minting function has to still exist and still be random, or the guard above
//    is protecting nothing.
const keysFile = join(root, "src/features/vault/keys.ts");
const keys = readFileSync(keysFile, "utf8");
if (!/export function mintObjectKey/.test(keys)) {
  problems.push(`${keysFile}: mintObjectKey is gone. Every check in this script assumed it.`);
}
if (!/randomBytes/.test(keys)) {
  problems.push(
    `${keysFile}: mintObjectKey no longer uses randomBytes. A key derived from the name or folder is exactly what this guard exists to prevent.`,
  );
}

/**
 * 4. The presigned upload URL must carry NO checksum parameters.
 *
 * 🔴 THE FAILURE THIS EXISTS TO END. Since v3.729 the AWS SDK adds an integrity
 * checksum to PutObject by default. Presigning has no body, so it signs the checksum of
 * an EMPTY one; the browser then uploads the real file and R2 rejects it on the
 * mismatch. The symptom is a progress bar that climbs normally and dies at a different
 * percentage every attempt, reported as a bare network error because R2's error
 * response has no CORS header for the browser to read. It looks exactly like a bad
 * connection, and it cost two failed uploads of a 54 MB file before anyone looked at
 * the actual URL.
 *
 * clientFor() disables it. This generates a real presigned URL with throwaway
 * credentials - local work, no network, no account - and fails the build if a checksum
 * parameter ever comes back, which is what an SDK upgrade would do silently.
 */
async function checkPresignedUrlHasNoChecksum(): Promise<void> {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

  // Mirrors clientFor() in src/features/vault/client.ts. Kept in step by this check
  // failing if the two ever drift on the settings that matter.
  const client = new S3Client({
    region: "auto",
    endpoint: "https://probe.r2.cloudflarestorage.com",
    credentials: { accessKeyId: "PROBEKEYPROBEKEY", secretAccessKey: "probesecretprobesecretprobe" },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  const url = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: "probe", Key: "v/probe/probe.mp4", ContentType: "video/mp4" }),
    { expiresIn: 60 },
  );
  const offenders = [...new URL(url).searchParams.keys()].filter((k) => /checksum/i.test(k));
  if (offenders.length > 0) {
    problems.push(
      `the presigned upload URL carries ${offenders.join(", ")}. R2 will reject every browser ` +
        `upload on a checksum mismatch, and the browser will report it as a network error. ` +
        `Check requestChecksumCalculation in src/features/vault/client.ts.`,
    );
  }

  // The disabling flags must actually be present in the shipped client, not only here.
  const clientSrc = readFileSync(join(root, "src/features/vault/client.ts"), "utf8");
  if (!/requestChecksumCalculation:\s*"WHEN_REQUIRED"/.test(clientSrc)) {
    problems.push(
      `src/features/vault/client.ts no longer sets requestChecksumCalculation: "WHEN_REQUIRED". ` +
        `Browser uploads will fail at an arbitrary percentage with no readable error.`,
    );
  }
}


/**
 * 5. Cleanup may never abort an upload that could still be running.
 *
 * 🔴 THE FAILURE THIS PREVENTS. Cleanup aborts incomplete multipart uploads to stop R2
 * billing for parts that will never become a file. It cannot tell a dead upload from a
 * slow one - only an old one from a new one - so the age cutoff is the entire safety
 * argument. Lower it towards zero and cleanup starts destroying uploads that are still
 * in flight, and the person watching the progress bar sees the same unreadable network
 * error the checksum bug produced, with the cause now inside this app.
 *
 * A presigned part URL lives six hours, so nothing legitimate is still running at
 * twelve. The floor is checked rather than the exact value so the cutoff can be tuned
 * without editing this script, but not tuned into a weapon.
 */
const AGE_FLOOR_HOURS = 12;

function checkOrphanAgeFloor(): void {
  const typesSrc = readFileSync(join(root, "src/features/vault/types.ts"), "utf8");
  const m = /ORPHAN_MAX_AGE_HOURS\s*=\s*(\d+)/.exec(typesSrc);
  if (!m) {
    problems.push(
      `src/features/vault/types.ts: ORPHAN_MAX_AGE_HOURS is gone. Cleanup's age cutoff is the only thing stopping it aborting uploads that are still running.`,
    );
    return;
  }
  const hours = Number(m[1]);
  if (hours < AGE_FLOOR_HOURS) {
    problems.push(
      `src/features/vault/types.ts: ORPHAN_MAX_AGE_HOURS is ${hours}, under the ${AGE_FLOOR_HOURS} hour floor. ` +
        `A presigned part URL lives 6 hours, so a cutoff this low lets cleanup abort an upload that is still in flight.`,
    );
  }

  // And the cleanup itself must still consult it. A cutoff nothing reads is decoration.
  const actionsSrc = readFileSync(join(root, "src/features/vault/actions.ts"), "utf8");
  const at = actionsSrc.indexOf("export async function cleanVaultOrphans");
  if (at < 0) {
    problems.push(`src/features/vault/actions.ts: cleanVaultOrphans is gone.`);
    return;
  }
  const body = actionsSrc.slice(at, at + 3000);
  if (!/ORPHAN_MAX_AGE_HOURS/.test(body) || !/initiatedAt/.test(body)) {
    problems.push(
      `src/features/vault/actions.ts: cleanVaultOrphans no longer tests an upload's age against ORPHAN_MAX_AGE_HOURS. ` +
        `It would abort uploads that are still running.`,
    );
  }
}


/**
 * 6. Reconcile's delete path must stay narrow.
 *
 * 🔴 THE FAILURE THIS PREVENTS. deleteVaultUnreferenced destroys real bytes, decided by
 * absence: an object with no database row. Four things keep that honest, and losing any
 * one of them turns it into a tool that deletes the owner's data.
 *
 *   - It must take NO key list. Accepting keys from the browser makes it an endpoint
 *     that deletes whatever is named to it, against a screen already minutes stale.
 *   - It must require a COMPLETE listing. A listing cut short at the page ceiling makes
 *     every object past the cut look unreferenced.
 *   - It must check isMintedKey. A bucket can hold objects this app never created - a
 *     cloud to cloud transfer, a hand upload - and those have no rows by definition.
 *   - It must check the age cutoff, so an upload still finishing is never taken.
 */
function checkReconcileDeleteIsNarrow(): void {
  const src = readFileSync(join(root, "src/features/vault/actions.ts"), "utf8");
  const at = src.indexOf("export async function deleteVaultUnreferenced");
  if (at < 0) {
    problems.push(`src/features/vault/actions.ts: deleteVaultUnreferenced is gone.`);
    return;
  }

  const openParen = src.indexOf("(", at);
  const params = balanced(src, openParen, "(", ")") ?? "";
  // One parameter, the bucket id. A second one is almost certainly a key list. Split and
  // drop the empties, because a multi-line signature carries a trailing comma and the
  // first version of this check counted that as a second parameter and failed the build.
  const paramCount = params
    .slice(1, -1)
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0).length;
  if (paramCount > 1) {
    problems.push(
      `src/features/vault/actions.ts: deleteVaultUnreferenced takes more than a bucket id. ` +
        `It must derive its own candidates - a key list from the caller makes it delete anything it is told to.`,
    );
  }

  const body = src.slice(at, at + 5000);
  for (const [needle, why] of [
    ["isMintedKey", "it would delete objects this app never uploaded, such as a cloud to cloud transfer"],
    ["listing.complete", "a truncated listing makes every object past the cut look unreferenced"],
    ["ORPHAN_MAX_AGE_HOURS", "it would delete an object whose upload is still finishing"],
    [
      "vaultActivity",
      "it would decide from absence alone, so a second install pointed at the same bucket would read every file in it as rubbish and offer to delete all of them",
    ],
    ["known.has", "the provenance set would be read but not applied"],
  ] as const) {
    if (!body.includes(needle)) {
      problems.push(
        `src/features/vault/actions.ts: deleteVaultUnreferenced no longer checks ${needle}, so ${why}.`,
      );
    }
  }
}

/**
 * 7. Reconcile must match rows across ALL tenants.
 *
 * 🔴 THE FAILURE THIS PREVENTS. Every other read in actions.ts is scoped by
 * actingConfigTenantId(), and adding that scope here looks like a consistency fix. It
 * is the opposite: a row belonging to another tenant sharing the bucket, or a row whose
 * tenant was deleted and whose tenantId is therefore null, would drop out of the
 * reference set - and its object would be reported as unreferenced and offered for
 * deletion. A live file, on a live page, deleted for tidiness.
 */
function checkReconcileMatchesEveryTenant(): void {
  const src = readFileSync(join(root, "src/features/vault/actions.ts"), "utf8");
  for (const fn of ["vaultReconcile", "deleteVaultUnreferenced"]) {
    const at = src.indexOf(`export async function ${fn}`);
    if (at < 0) continue;
    const body = src.slice(at, at + 4000);
    const findAt = body.indexOf("prisma.vaultFile.findMany");
    if (findAt < 0) {
      problems.push(
        `src/features/vault/actions.ts: ${fn} no longer reads the vault file rows it compares against.`,
      );
      continue;
    }
    const call = balanced(body, body.indexOf("(", findAt), "(", ")");
    if (!call) continue;
    const whereAt = call.search(/\bwhere\s*:\s*\{/);
    if (whereAt < 0) continue;
    const whereBlock = balanced(call, call.indexOf("{", whereAt), "{", "}");
    // 🟡 The bare word, not "tenantId:". Object shorthand is how this would really be
    // written - where: { bucketId, tenantId } - and a check that insisted on a colon
    // missed exactly that. A planted violation proved it before this shipped.
    if (whereBlock && /\btenantId\b/.test(whereBlock)) {
      problems.push(
        `src/features/vault/actions.ts: ${fn} filters its row set by tenantId. ` +
          `Another tenant's file, or a file whose tenant was deleted, would then look unreferenced and be deleted. ` +
          `The BUCKET is checked against the acting tenant; the row set must not be.`,
      );
    }
  }
}


/**
 * 8. Cleanup must ask whether an upload is still running.
 *
 * 🔴 THE FAILURE THIS PREVENTS. An abort destroys every part uploaded so far, and those
 * parts are pieces of a real file. Age cannot tell a stranded upload from a working
 * one: a large file on a slow link legitimately takes longer than any cutoff worth
 * setting, and aborting it throws away hours of someone's transfer with no way back.
 *
 * R2 timestamps every part, so the upload can be asked directly. Age only opens the
 * question; a recent part answers it. Remove the liveness check and the cutoff becomes
 * a timer that kills slow uploads.
 */
function checkCleanupAsksLiveness(): void {
  const src = readFileSync(join(root, "src/features/vault/actions.ts"), "utf8");
  const at = src.indexOf("export async function cleanVaultOrphans");
  if (at < 0) {
    problems.push(`src/features/vault/actions.ts: cleanVaultOrphans is gone.`);
    return;
  }
  const body = src.slice(at, at + 5000);
  if (!/partActivity/.test(body) || !/UPLOAD_QUIET_HOURS/.test(body)) {
    problems.push(
      `src/features/vault/actions.ts: cleanVaultOrphans no longer checks whether an upload is still receiving parts. ` +
        `Age alone would abort a large file that is uploading normally and discard every part of it.`,
    );
  }

  const typesSrc = readFileSync(join(root, "src/features/vault/types.ts"), "utf8");
  const q = /UPLOAD_QUIET_HOURS\s*=\s*(\d+)/.exec(typesSrc);
  if (!q || Number(q[1]) < 1) {
    problems.push(
      `src/features/vault/types.ts: UPLOAD_QUIET_HOURS is missing or under an hour. A window that short reads a brief network stall as an abandoned upload.`,
    );
  }
}

/**
 * 9. The stale-reservation sweep must recover, not delete.
 *
 * 🔴 THE FAILURE THIS PREVENTS. A reservation still marked pending after its ticket
 * expired does NOT mean the upload failed. A PUT that reached R2 while its confirmation
 * never ran - a closed tab, a dropped reply, a deploy restarting the app - leaves a
 * complete, valid file behind a row that still says pending. An earlier version of the
 * sweep deleted that object along with the row. It must HEAD the key first and confirm
 * the row when the object is there, so a good file is never destroyed to tidy a row.
 */
function checkSweepRecoversFirst(): void {
  const src = readFileSync(join(root, "src/features/vault/actions.ts"), "utf8");
  const at = src.indexOf("export async function sweepVaultPending");
  if (at < 0) {
    problems.push(`src/features/vault/actions.ts: sweepVaultPending is gone.`);
    return;
  }
  const body = src.slice(at, at + 4500);
  if (!/headObject/.test(body)) {
    problems.push(
      `src/features/vault/actions.ts: sweepVaultPending no longer asks R2 whether the object is there before acting. ` +
        `A complete upload whose confirmation never ran would be treated as a failure.`,
    );
  }
  if (/deleteObject/.test(body)) {
    problems.push(
      `src/features/vault/actions.ts: sweepVaultPending deletes an object. It must only ever delete the ROW - ` +
        `the object at a pending key may be a complete upload that simply never got confirmed.`,
    );
  }

  // And it has to actually be called, or none of the above runs. It was dead code once.
  const pageSrc = readFileSync(join(root, "src/app/admin/vault/page.tsx"), "utf8");
  if (!/sweepVaultPending\s*\(/.test(pageSrc)) {
    problems.push(
      `src/app/admin/vault/page.tsx: nothing calls sweepVaultPending. It was written to run here and for a while nothing did, so reservations were never cleared at all.`,
    );
  }
}

async function main(): Promise<void> {
  await checkPresignedUrlHasNoChecksum();
  checkOrphanAgeFloor();
  checkReconcileDeleteIsNarrow();
  checkReconcileMatchesEveryTenant();
  checkCleanupAsksLiveness();
  checkSweepRecoversFirst();

  if (problems.length === 0) {
    console.log(
      "🟢 vault: keys minted once, uploads carry no checksum, a live upload cannot be aborted, a landed upload is recovered not deleted, and nothing is removed without proof this install put it there.",
    );
    process.exit(0);
  }

  console.error(`🔴 ${problems.length} problem(s) with the vault's immutable object keys.\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nWhy this matters: a vault link is pasted into VidaPulse, an LMS and landing pages.\n` +
      `Changing an object key breaks all of them at once, with no error anywhere in this app.\n` +
      `Rename and move are database edits; only a cross-bucket move touches bytes.`,
  );
  process.exit(1);

}

main().catch((e) => {
  console.error("verify:vault crashed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
