/**
 * Custom-field normalization verification.
 *
 * The portable format carries `preResultFields` and `optinFields` as opaque JSON, so a
 * file written anywhere else can name a field type this app has no way to render. One
 * did: a "textarea", and a "choice" whose options were the qualification gate's
 * {label, points} objects. Nothing complained at import. The editor then crashed
 * trimming an option that was an object rather than a string - which took the whole
 * admin page with it - and until that field was gone, every save of the assessment
 * failed validation pointing at a step the owner was not even looking at.
 *
 * So the rule this file holds is: whatever a file says, what gets stored and shown is
 * a field this app can render, and it still asks the question the file asked.
 *
 *   npx tsx scripts/verify-custom-fields.ts
 */
import { normalizeCustomFields } from "../src/features/assessment/custom-fields";
import { preResultFieldSchema } from "../src/features/assessment/schemas";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Custom-field normalization verification\n");

// The exact shape that broke the builder: a file written in the gate's vocabulary.
const foreign = [
  { id: "pr1", type: "textarea", label: "Write what your life looks like in three years.", options: [], required: true, placeholder: "As it would actually be." },
  { id: "pr2", type: "text", label: "What would have to be true?", options: [], required: true },
  {
    id: "pr4",
    type: "choice",
    label: "I understand this is not a quick fix.",
    options: [{ id: "ack1", label: "I understand, and I am willing.", points: 0, disqualifies: false }],
    required: true,
  },
  { id: "pr5", type: "text", label: "   ", options: [], required: false },
];
const fields = normalizeCustomFields(foreign);

expect("a field with no label is dropped", fields.length === 3, JSON.stringify(fields.map((f) => f.id)));
expect("a long-answer type lands as a text box", fields[0]?.type === "text", fields[0]?.type);
expect("its question survives", fields[0]?.label.startsWith("Write what your life") === true, fields[0]?.label);
expect("a choice becomes a dropdown", fields[2]?.type === "select", fields[2]?.type);
expect(
  "and its options are strings, not the objects the file wrote",
  fields[2]?.options.length === 1 && fields[2].options[0] === "I understand, and I am willing.",
  JSON.stringify(fields[2]?.options),
);
expect(
  "every field now passes the schema that gates a save",
  fields.every((f) => preResultFieldSchema.safeParse(f).success),
  JSON.stringify(fields.filter((f) => !preResultFieldSchema.safeParse(f).success)),
);

// A dropdown whose options were all unreadable has nothing to pick, so it asks in words.
const emptyChoice = normalizeCustomFields([{ id: "x", type: "select", label: "Pick one", options: [{}, ""], required: false }]);
expect("a dropdown left with no options falls back to a text box", emptyChoice[0]?.type === "text", JSON.stringify(emptyChoice));

// Shapes that are not a field list at all must not throw.
for (const junk of [null, undefined, "", 0, {}, [null], ["a string"], [[]]]) {
  const out = normalizeCustomFields(junk);
  expect(`junk input (${JSON.stringify(junk) ?? "undefined"}) yields an empty list`, Array.isArray(out) && out.length === 0, JSON.stringify(out));
}

// The app's own shape is carried through untouched.
const mine = [{ id: "a1", label: "Company size", type: "select", options: ["1-10", "11-50"], required: true }];
const same = normalizeCustomFields(mine);
expect("a field this app wrote is unchanged", JSON.stringify(same) === JSON.stringify(mine), JSON.stringify(same));

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
