/**
 * The one invariant coexistence introduces that cannot be allowed to rot:
 *
 *   PEOPLE WHO ARRIVED OFF A CONNECTED PHONE NEVER REACH A BROADCAST BY DEFAULT.
 *
 * They are in the contacts table because the owner asked for their own address book
 * and their own chats, and that is their data. But they opted in to nothing, and
 * sending them templates is what drops a WhatsApp number's quality rating and then its
 * sending tier. The cost of this regressing is not a bad email: it is the number.
 *
 * It is checked here rather than trusted because it is one easy edit away from gone.
 * audienceWhere is a pile of spread conditionals, and anybody adding a filter could
 * drop this one without noticing - the symptom would be a larger audience, which
 * looks like good news.
 *
 * Run by the build, so it fails before a deploy rather than after a send.
 */
import { audienceWhere } from "../src/lib/broadcasts/audience";
import { UNCONSENTED_SOURCES, isUnconsentedSource } from "../src/lib/contacts/sources";

let failed = 0;

function check(name: string, ok: boolean) {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed += 1;
}

const base = { assessmentIds: [], tagIds: [], bands: [], createdFrom: null, createdTo: null };

console.log("contact consent:");

// 1. By default the unconsented sources are excluded.
const dflt = audienceWhere("t1", base, "WABA");
const guard = dflt.OR;
check("a default audience carries a source guard", Array.isArray(guard) && guard.length === 2);

if (Array.isArray(guard)) {
  // 2. NULL-SAFE. `source NOT IN (...)` is not true for a NULL source in SQL, so a
  //    bare notIn would exclude every contact captured before the column was written.
  //    That is almost all of them, and the bug would read as "nobody is in my list".
  const allowsNull = guard.some((c) => c && typeof c === "object" && "source" in c && c.source === null);
  check("contacts with no source are still included", allowsNull);

  const excludes = guard.some((c) => {
    if (!c || typeof c !== "object" || !("source" in c)) return false;
    const s = c.source;
    if (!s || typeof s !== "object" || !("notIn" in s)) return false;
    const list = (s as { notIn?: unknown }).notIn;
    return Array.isArray(list) && UNCONSENTED_SOURCES.every((v) => list.includes(v));
  });
  check("every unconsented source is excluded by name", excludes);
}

// 3. Only an explicit opt-in lifts it.
const opted = audienceWhere("t1", { ...base, includeImported: true }, "WABA");
check("ticking include drops the guard", opted.OR === undefined);

// 4. The two non-negotiables are still there, since this is the same object.
check("opted-out people are excluded", dflt.marketingOptOutAt === null);
check("a WABA audience needs a mobile", JSON.stringify(dflt.mobile) === JSON.stringify({ not: null }));

// 5. The source list and the predicate cannot drift apart.
check("the predicate agrees with the list", UNCONSENTED_SOURCES.every((s) => isUnconsentedSource(s)));
check("a submission is not treated as unconsented", !isUnconsentedSource("SUBMISSION"));
check("a missing source is not treated as unconsented", !isUnconsentedSource(null));

if (failed) {
  console.error(`\n🔴 ${failed} check(s) failed. Imported contacts could reach a broadcast.`);
  process.exit(1);
}
console.log("\n🟢 Nobody who arrived off a phone reaches a broadcast unless it is asked for.");

export {};
