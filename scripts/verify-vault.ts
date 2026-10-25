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

async function main(): Promise<void> {
  await checkPresignedUrlHasNoChecksum();
  checkOrphanAgeFloor();

  if (problems.length === 0) {
    console.log(
      "🟢 vault: object keys are minted once, presigned uploads carry no checksum, and cleanup cannot abort a live upload.",
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
