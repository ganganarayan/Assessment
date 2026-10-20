/**
 * Does every table, column and enum in prisma/schema.prisma have a migration that
 * creates it? Run with:
 *   npm run verify:schema-migrations
 *
 * 🔴 THE FAILURE THIS EXISTS TO END, which cost a staging outage on 20-10-2026. Several
 * sessions edit this repository at once, and prisma/schema.prisma is a shared file.
 * Staging it takes whatever else is in it - so one session committed another's
 * half-finished models while the migration creating their tables was still untracked.
 * The pushed schema then declared tables and a column on Submission that the database
 * did not have, and because the generated client lists every scalar in its default
 * select, a plain submission.findMany() asked for a column that did not exist. That is
 * every submissions read in the product, and nothing in the error says "migration".
 *
 * "I only staged my own paths" is not protection for a shared file. A check is.
 *
 * DELIBERATELY DATABASE-FREE. `prisma migrate diff --from-migrations` is the
 * authoritative answer and wants a shadow database it is allowed to RESET, which no
 * staging database may ever be, and no build should need one. This reads both sides as
 * text: the schema says what the client will select, the migrations say what the
 * database will have, and they have to agree.
 *
 * It reports only what is MISSING from the migrations. A column that exists in the
 * database and not in the schema is harmless to a reader and is somebody's deliberate
 * leftover, so it is not an error here.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? ".";
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migDir = join(root, "prisma/migrations");

const migrations = readdirSync(migDir).filter((d) => existsSync(join(migDir, d, "migration.sql")));
const sql = migrations.map((d) => readFileSync(join(migDir, d, "migration.sql"), "utf8")).join("\n");

/* ---------------------------------------------- what the migrations build --- */

// Comments out first, so "-- creates the foo table" never counts as creating one.
const statements = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";");

/** table -> the columns some migration puts on it */
const built = new Map<string, Set<string>>();
const touch = (table: string): Set<string> => {
  const existing = built.get(table);
  if (existing) return existing;
  const fresh = new Set<string>();
  built.set(table, fresh);
  return fresh;
};

for (const st of statements) {
  const create = st.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"([^"]+)"\s*\(([\s\S]*)/i);
  if (create?.[1]) {
    const cols = touch(create[1]);
    // The type may be QUOTED - an enum column reads `"status" "TenantStatus" NOT NULL` -
    // so allow a quote after the name. This also captures the type itself as though it
    // were a column, which is harmless: the set is only ever tested for membership.
    for (const c of (create[2] ?? "").matchAll(/"([^"]+)"\s+"?[A-Za-z]/g)) cols.add(c[1] as string);
    continue;
  }
  const alter = st.match(/ALTER TABLE\s+(?:IF EXISTS\s+)?(?:ONLY\s+)?"([^"]+)"([\s\S]*)/i);
  if (alter?.[1]) {
    const cols = touch(alter[1]);
    const body = alter[2] ?? "";
    // One statement can add many columns, across many lines.
    for (const c of body.matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/gi)) cols.add(c[1] as string);
    // A renamed column answers to its new name afterwards.
    for (const c of body.matchAll(/RENAME COLUMN\s+"[^"]+"\s+TO\s+"([^"]+)"/gi)) cols.add(c[1] as string);
  }
}

// A renamed table keeps the columns it was created with.
for (const st of statements) {
  const rn = st.match(/ALTER TABLE\s+(?:IF EXISTS\s+)?"([^"]+)"\s+RENAME TO\s+"([^"]+)"/i);
  if (rn?.[1] && rn[2]) built.set(rn[2], touch(rn[1]));
}

/** enum -> the values some migration gives it */
const enumsBuilt = new Map<string, Set<string>>();
const touchEnum = (name: string): Set<string> => {
  const existing = enumsBuilt.get(name);
  if (existing) return existing;
  const fresh = new Set<string>();
  enumsBuilt.set(name, fresh);
  return fresh;
};

for (const st of statements) {
  const created = st.match(/CREATE TYPE\s+"([^"]+)"\s+AS ENUM\s*\(([\s\S]*?)\)/i);
  if (created?.[1]) {
    const vals = touchEnum(created[1]);
    for (const v of (created[2] ?? "").matchAll(/'([^']+)'/g)) vals.add(v[1] as string);
    continue;
  }
  const added = st.match(/ALTER TYPE\s+"([^"]+)"\s+ADD VALUE\s+(?:IF NOT EXISTS\s+)?'([^']+)'/i);
  if (added?.[1] && added[2]) touchEnum(added[1]).add(added[2]);
  const renamed = st.match(/ALTER TYPE\s+"([^"]+)"\s+RENAME VALUE\s+'[^']+'\s+TO\s+'([^']+)'/i);
  if (renamed?.[1] && renamed[2]) touchEnum(renamed[1]).add(renamed[2]);
}

/* ------------------------------------------------ what the schema expects --- */

const problems: string[] = [];
const SCALARS = /^(String|Int|BigInt|Float|Decimal|Boolean|DateTime|Json|Bytes)$/;

const enumDefs = [...schema.matchAll(/^enum\s+(\w+)\s*\{([^}]*)\}/gms)].map((m) => ({
  name: m[1] as string,
  values: [...(m[2] ?? "").matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\/\/.*)?$/gm)].map(
    (v) => v[1] as string,
  ),
}));

for (const e of enumDefs) {
  const have = enumsBuilt.get(e.name);
  if (!have) {
    problems.push(`enum ${e.name}: no CREATE TYPE in any migration`);
    continue;
  }
  for (const v of e.values) {
    if (!have.has(v)) problems.push(`enum ${e.name}: value ${v} has no migration adding it`);
  }
}

const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((m) => ({
  name: m[1] as string,
  body: m[2] as string,
}));

for (const model of models) {
  const mapped = model.body.match(/@@map\("([^"]+)"\)/);
  const table = mapped?.[1] ?? model.name;
  const have = built.get(table);
  if (!have) {
    problems.push(`model ${model.name} (table "${table}"): no CREATE TABLE in any migration`);
    continue;
  }

  for (const line of model.body.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
    const field = t.match(/^(\w+)\s+(\w+)(\[\])?/);
    if (!field?.[1] || !field[2]) continue;
    // A list is a relation, never a column.
    if (field[3]) continue;
    const isColumn = SCALARS.test(field[2]) || enumDefs.some((e) => e.name === field[2]);
    if (!isColumn) continue;
    const column = t.match(/@map\("([^"]+)"\)/)?.[1] ?? field[1];
    if (!have.has(column)) {
      problems.push(
        `${model.name}.${field[1]} (column "${table}"."${column}"): no migration creates it`,
      );
    }
  }
}

console.log(
  `schema vs migrations: ${models.length} models, ${enumDefs.length} enums, ${migrations.length} migrations.`,
);
if (problems.length === 0) {
  console.log("🟢 Every table, column and enum in the schema has a migration behind it.");
  process.exit(0);
}
console.error("");
for (const p of problems) console.error(`  MISSING  ${p}`);
console.error(
  `\n🔴 ${problems.length} problem(s). The database will not match the generated client, and the` +
    ` first symptom will be a read failing on a column that does not exist.` +
    `\nWrite the migration, or take the model back out of the schema until it has one.`,
);
process.exit(1);
