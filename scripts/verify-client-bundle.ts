/**
 * Does any CLIENT component reach server-only code?
 *
 * The failure this exists to catch, from 2026-10-13: the platform console is a
 * `"use client"` component and imported `features/platform/effective-plan`, which
 * imported `lib/billing/plan-resolve`, which imports `lib/db/prisma`. Prisma then
 * threw "PrismaClient is unable to run in this browser environment" while the chunk
 * was still being evaluated, so /platform rendered its error boundary and nothing on
 * the page worked.
 *
 * 🔴 EVERY OTHER GATE PASSED. The code is valid TypeScript, eslint is happy, and the
 * Railway build succeeds, because nothing about it is wrong on the server. Worse, it
 * was latent for days: webpack had been shaking the prisma module out of the bundle,
 * and stopped the day a fourth client component was added to the same page. So the
 * commit that breaks this is not the commit that introduced it.
 *
 * The walk: start at every file whose first statement is "use client", follow its
 * internal imports, and stop at any module marked "use server" (those become client
 * references at build time and their bodies never ship). Report any path that lands
 * on a module in the forbidden list.
 *
 * Type-only imports are skipped - `import type { X } from "..."` and a specifier list
 * where every name carries `type` are both erased, which is how a client component is
 * allowed to name a server module's types.
 *
 *   npx tsx scripts/verify-client-bundle.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";

const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");

/** Modules that must never end up in a browser bundle, by path fragment. */
const FORBIDDEN = [
  "src/lib/db/prisma",
  "src/lib/settings/config",
  "src/lib/crypto",
  "src/lib/env",
];

const EXTS = [".ts", ".tsx", ".js", ".jsx"];

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (EXTS.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

/** "use client" / "use server" only count as directives at the very top of a file. */
function directive(source: string): "client" | "server" | null {
  const head = source.slice(0, 2000);
  const m = /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["'](use (client|server))["']/.exec(head);
  if (!m) return null;
  return m[2] === "client" ? "client" : "server";
}

/** Every value import in a file: specifier plus whether it is erased at build time. */
function imports(source: string): string[] {
  const out: string[] = [];
  const re = /import\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const clause = m[1] ?? "";
    const spec = m[2] ?? "";
    if (/^\s*type\s/.test(clause)) continue; // import type { ... }
    const named = /^\s*\{([\s\S]*)\}\s*$/.exec(clause);
    if (named) {
      const parts = (named[1] ?? "").split(",").map((p) => p.trim()).filter(Boolean);
      // Every specifier is a type, so the whole statement is erased.
      if (parts.length > 0 && parts.every((p) => p.startsWith("type "))) continue;
    }
    out.push(spec);
  }
  // Side-effect imports carry no clause and the regex above misses them.
  const bare = /import\s+["']([^"']+)["']/g;
  while ((m = bare.exec(source))) out.push(m[1] ?? "");
  return out;
}

/** Resolve an internal specifier to a file on disk, or null when it is a package. */
function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // node_modules
  for (const e of EXTS) {
    const p = base + e;
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      /* keep trying */
    }
  }
  for (const e of EXTS) {
    const p = join(base, "index" + e);
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

const files = walkFiles(SRC);
const sources = new Map<string, string>();
const read = (f: string): string => {
  let s = sources.get(f);
  if (s === undefined) {
    s = readFileSync(f, "utf8");
    sources.set(f, s);
  }
  return s;
};

const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");
const forbidden = (f: string) => FORBIDDEN.some((bad) => rel(f).startsWith(bad));

const entries = files.filter((f) => directive(read(f)) === "client");
const problems: string[] = [];

for (const entry of entries) {
  // Breadth-first, so the path reported is the shortest one - the easiest to fix.
  const seen = new Set<string>([entry]);
  const queue: Array<{ file: string; path: string[] }> = [{ file: entry, path: [entry] }];
  while (queue.length > 0) {
    const { file, path } = queue.shift()!;
    for (const spec of imports(read(file))) {
      const target = resolveSpec(spec, file);
      if (!target || seen.has(target)) continue;
      seen.add(target);
      if (forbidden(target)) {
        problems.push([...path, target].map(rel).join("\n        -> "));
        queue.length = 0; // one path per client entry is enough to act on
        break;
      }
      // A "use server" module is replaced by a client reference: its imports do not
      // ship, so the walk stops here rather than reporting the whole server tree.
      if (directive(read(target)) === "server") continue;
      queue.push({ file: target, path: [...path, target] });
    }
  }
}

console.log(`Client bundle verification\n\n  ${entries.length} client components walked`);
console.log(`  forbidden: ${FORBIDDEN.join(", ")}\n`);

if (problems.length === 0) {
  console.log("  PASS  no client component reaches server-only code.");
  process.exit(0);
}

for (const p of problems) console.log(`  FAIL  ${p}\n`);
console.log(
  `${problems.length} client component(s) reach server-only code. Move the shared part into a\n` +
    "module with no database import, as src/lib/billing/plan-grant.ts does, or mark the\n" +
    "module \"use server\" if it is meant to be called as a server action.",
);
process.exit(1);
