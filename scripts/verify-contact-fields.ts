/**
 * CUSTOM VALUES: the promises no type can keep.
 *
 * Static checks over the source, like the other verify gates: these are rules about
 * ORDER and about what must never reach a customer, and a compiler has nothing to say
 * about either. Run in the build chain, so a change that breaks one of them cannot
 * reach staging.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function expect(name: string, ok: boolean, why: string) {
  if (ok) {
    console.log(`  PASS  ${name}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${name}\n        ${why}`);
}

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

const names = read("src", "lib", "contacts", "field-names.ts");
const fields = read("src", "lib", "contacts", "fields.ts");
const runSrc = read("src", "lib", "workflows", "run.ts");
const broadcastSrc = read("src", "lib", "broadcasts", "run.ts");
const actionsSrc = read("src", "features", "contacts", "actions.ts");
const schema = read("prisma", "schema.prisma");
const screen = read("src", "features", "contacts", "components", "contacts-screen.tsx");
const builder = read("src", "features", "workflows", "components", "workflow-builder.tsx");

console.log("\nCustom values\n");

/* --------------------------------------------------- the names the app owns --- */

expect(
  "the built-in placeholders cannot be redefined",
  /RESERVED_PLACEHOLDERS/.test(names) &&
    /\.\.\.WORKFLOW_PLACEHOLDERS/.test(names) &&
    /RESERVED_PLACEHOLDERS\.includes\(k\)/.test(names),
  "fillPlaceholders builds its map from the lead and then lets the call site overwrite it, so a field called firstName would not fail - it would silently win or lose depending on which path the message took, after the workspace had redefined every message they already wrote",
);
expect(
  "the reserved list is derived, not retyped",
  /import \{ WORKFLOW_PLACEHOLDERS \} from "@\/features\/workflows\/types"/.test(names),
  "a second copy of the built-in names is a copy that goes stale: the next placeholder added to the engine would be free for a workspace to claim",
);
expect(
  "a key is refused at creation rather than at send time",
  /keyProblem/.test(actionsSrc) && /const problem = keyProblem\(key\)/.test(actionsSrc),
  "a name checked only when a message goes out is a name somebody has already written into five messages",
);
expect(
  "the key is derived from the name, and shown before it is created",
  /keyFromLabel/.test(names) && /keyFromLabel\(newField\)/.test(screen),
  "the name somebody types is not the name they will write in a message; finding that out afterwards means renaming it in everything already written",
);

/* ------------------------------------------- an empty value is never a hole --- */

expect(
  "the hold rule exists and names the missing value",
  /heldForMissingValue/.test(names) && /return key;/.test(names),
  "\"held\" is something somebody opens a ticket about; \"no meetingLink yet\" is something they can act on",
);
expect(
  "a sequence holds the message rather than sending it with a hole",
  /heldForMissingValue\(/.test(runSrc) && /No \$\{missing\} for them yet\./.test(runSrc),
  "a message saying \"join here:\" with nothing after it is the failure this whole feature is shaped around, and it reaches a customer",
);
expect(
  "a broadcast holds it too, and says why per recipient",
  /heldForMissingValue\(/.test(broadcastSrc) && /No \$\{held\} for them yet\./.test(broadcastSrc),
  "a blast that skipped four hundred people without saying why is indistinguishable from a broken send",
);
expect(
  "holding is the default for a new value",
  /holdWhenEmpty Boolean @default\(true\)/.test(schema),
  "the safe answer has to be the one nobody has to find: a workspace that never opens the checkbox should still not send a half-finished message",
);
expect(
  "no contact means empty, not exempt",
  /if \(!contactId\) return \{ values: \{\}, holdKeys \};/.test(fields),
  "a sequence about a workspace has no person to hold values for, and a special case that skipped the rule there would send exactly the message with a hole in it that the rule exists to stop",
);

/* ----------------------------------------------- order, and whose name wins --- */

expect(
  "the workspace's values cannot shadow the engine's own",
  /\{ \.\.\.resolved\.values, unsubscribeUrl \}/.test(runSrc) &&
    /\{ \.\.\.resolved\.values, unsubscribeUrl \}/.test(broadcastSrc),
  "the unsubscribe link is the one placeholder that must always be the engine's: a workspace value overwriting it would send a message whose way out goes nowhere",
);

/* ---------------------------------------------------------- the Zoom link --- */

expect(
  "the Zoom link lives on the contact, not on the run",
  /setContactValue\(run\.tenantId, who\.contactId, "meetingLink"/.test(runSrc) &&
    !/meetingLink String\?/.test(schema),
  "on the run it was visible only inside the sequence that made it; on the contact every sequence, every message and the owner can see it, and a second meeting simply overwrites the first",
);
expect(
  "the field it writes to is created on demand",
  /ensureSystemField\(run\.tenantId, "meetingLink"\)/.test(runSrc),
  "a workspace that never connects Zoom should not carry a field it can neither fill nor delete",
);
expect(
  "a system field cannot be deleted",
  /if \(field\.system\)/.test(actionsSrc),
  "the app writes meetingLink itself and a sequence somewhere already says it; a workspace is not expected to know that, so the answer is a refusal rather than a message that quietly stops filling in",
);

/* ------------------------------------------------------- the registry's job --- */

expect(
  "the picker offers what this workspace keeps",
  /customPlaceholders/.test(builder) && /options\.customPlaceholders\.map/.test(builder),
  "a placeholder nobody can see is a placeholder nobody uses, and one somebody guesses at is a literal {{planName}} in front of a customer",
);
expect(
  "a value can be filled in by hand",
  /setContactFieldValue/.test(actionsSrc) && /setContactFieldValue/.test(screen),
  "without this only the Zoom step could ever write a value, so a declared field would stay empty forever and every message using it would be held for good",
);
expect(
  "the contact is checked against the workspace, not just the field",
  /prisma\.contact\.findFirst\(\{[\s\S]{0,120}tenantId: s\.tenantId/.test(actionsSrc),
  "an id arrives from a browser; may-edit-contacts is a different question from may-edit-THIS-contact",
);
expect(
  "the registry is read once per send loop",
  /loadContactFields\(b\.tenantId\)/.test(broadcastSrc),
  "a blast to five thousand people would otherwise run five thousand copies of a query whose answer cannot change mid-send",
);
expect(
  "the pure half has no database in it",
  !/db\/prisma/.test(names),
  "the contacts screen is a client component and needs keyFromLabel; importing it from the module that talks to Prisma pulls the database client into the browser bundle",
);

console.log(failures === 0 ? "\n🟢 Custom values: all checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);

// A module, not a global script: every script here declares its own helpers, and
// without an export tsc treats them as one shared scope and calls them duplicates.
export {};
