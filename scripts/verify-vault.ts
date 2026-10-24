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

const problems: string[] = [];
const files = sources(join(root, "src"));

for (const file of files) {
  const text = readFileSync(file, "utf8");

  // 1. No update may write objectKey. The slice is generous rather than balanced -
  //    over-reading risks a false positive, which is the safe direction for a guard
  //    whose failure mode is a silent broken link in production.
  for (const m of text.matchAll(/prisma\.vaultFile\.update(?:Many)?\s*\(/g)) {
    const window = text.slice(m.index ?? 0, (m.index ?? 0) + 700);
    if (/\bobjectKey\s*:/.test(window)) {
      problems.push(
        `${file}: a vaultFile update writes objectKey. The key is immutable - renaming and moving are name/folder edits only.`,
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

if (problems.length === 0) {
  console.log("🟢 vault: object keys are minted once and never rewritten.");
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
