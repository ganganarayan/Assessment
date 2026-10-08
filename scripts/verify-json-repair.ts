/**
 * Prove the JSON repairer fixes what it claims and, far more importantly, that it NEVER
 * touches the inside of a string.
 *
 * A repairer that silently edits a respondent-facing question is worse than no repairer
 * at all: the save succeeds, the screen looks right, and a word has changed in a
 * sentence somebody will read on a live funnel. So the content-safety cases below are
 * the point of this file, and the convenience cases are the easy half.
 *
 *   npx tsx scripts/verify-json-repair.ts
 */
import { repairJson, locateJsonError } from "../src/features/templates/json-repair";

let failures = 0;
const ok = (name: string) => console.log(`  PASS  ${name}`);
const fail = (name: string, detail: string) => {
  failures += 1;
  console.log(`  FAIL  ${name}\n        ${detail}`);
};

/** The repaired text must parse AND deep-equal the expected value. */
function fixes(name: string, broken: string, expected: unknown) {
  const r = repairJson(broken);
  if (!r.parses) {
    fail(name, `did not parse after repair. fixes=${JSON.stringify(r.fixes)}\n        got: ${r.text}`);
    return;
  }
  const got = JSON.parse(r.text);
  const a = JSON.stringify(got);
  const b = JSON.stringify(expected);
  if (a !== b) fail(name, `parsed to ${a}\n        expected  ${b}`);
  else if (r.fixes.length === 0) fail(name, "repaired it but reported no fixes - the person would be asked to approve nothing");
  else ok(`${name}  [${r.fixes.join("; ")}]`);
}

/** Valid JSON must come back byte-identical, with nothing reported. */
function untouched(name: string, text: string) {
  const r = repairJson(text);
  if (r.text !== text) fail(name, `rewrote valid JSON.\n        in:  ${text}\n        out: ${r.text}`);
  else if (r.fixes.length) fail(name, `reported fixes on valid JSON: ${r.fixes.join("; ")}`);
  else ok(name);
}

console.log("\nThe mistakes people actually make\n");

fixes("trailing comma in an object", '{"a":1,}', { a: 1 });
fixes("trailing comma in an array", '{"a":[1,2,]}', { a: [1, 2] });
fixes("missing comma between two objects", '[{"a":1}\n{"b":2}]', [{ a: 1 }, { b: 2 }]);
fixes("missing comma between two keys", '{"a":1\n"b":2}', { a: 1, b: 2 });
fixes("missing comma before an array", '{"a":[1]\n"b":[2]}', { a: [1], b: [2] });
fixes("missing comma between strings in an array", '["a"\n"b"]', ["a", "b"]);
fixes("missing comma before a number", '{"a":1\n"b":2,"c":3}', { a: 1, b: 2, c: 3 });
fixes("unclosed object at the end", '{"a":{"b":1}', { a: { b: 1 } });
fixes("unclosed array at the end", '{"a":[1,2', { a: [1, 2] });
fixes("unquoted key", "{a:1}", { a: 1 });
fixes("single-quoted string", "{\"a\":'hello'}", { a: "hello" });
fixes("a line comment", '{"a":1 // why\n}', { a: 1 });
fixes("a block comment", '{"a":1 /* note */ }', { a: 1 });
fixes("a byte-order mark", '﻿{"a":1}', { a: 1 });
fixes("curly quotes as delimiters", '{"a":“hello”}', { a: "hello" });
fixes("several at once", '{a:1,\n"b":[1,2,]\n"c":{"d":2}', { a: 1, b: [1, 2], c: { d: 2 } });

console.log("\nContent must survive untouched\n");

untouched("an apostrophe in a question", '{"text":"What\'s stopping you?"}');
untouched("a comma inside a sentence", '{"text":"Yes, and it is working"}');
untouched("braces inside a sentence", '{"text":"Use {name} in the subject"}');
untouched("a double slash inside a string", '{"url":"https://example.com/a"}');
untouched("a block-comment opener inside a string", '{"text":"a /* b */ c"}');
untouched("curly quotes INSIDE a string", '{"text":"she said “yes” today"}');
untouched("an escaped quote", '{"text":"she said \\"yes\\""}');
untouched("a newline escape", '{"text":"line one\\nline two"}');
untouched("a real template-shaped document", JSON.stringify({ slug: "a", body: { categories: [{ questions: [{ text: "It's 1, 2 or 3?" }] }] } }, null, 2));

// The specific corruption worth naming: a repairer that strips "trailing commas" with a
// regex eats the comma in this sentence and nobody notices until a respondent reads it.
{
  const doc = '{"text":"First, second, and third,"}';
  const r = repairJson(doc);
  if (r.text !== doc) fail("a sentence ending in a comma", `rewritten to ${r.text}`);
  else ok("a sentence ending in a comma");
}

console.log("\nWhat it must NOT pretend to fix\n");

{
  // A stray closer is ambiguous - deleting it is a guess at intent. It must fail
  // honestly rather than reshape the document.
  const r = repairJson('{"a":1}}');
  if (r.parses) fail("a stray closing brace", "claimed to fix something it cannot know how to fix");
  else ok("a stray closing brace is left alone and reported as unfixable");
}

console.log("\nPointing at the error\n");

{
  const text = '{\n  "a": 1,\n  "b": oops\n}';
  try {
    JSON.parse(text);
    fail("error location", "the test document unexpectedly parsed");
  } catch (e) {
    const loc = locateJsonError(text, e instanceof Error ? e.message : "");
    if (!loc) fail("error location", "could not locate the error at all");
    else if (loc.line !== 3) fail("error location", `said line ${loc.line}, expected 3`);
    else ok(`error located on line ${loc.line}: ${loc.lineText.trim()}`);
  }
}

console.log(failures === 0 ? "\nJSON repair is safe.\n" : `\n${failures} problem(s) found.\n`);
process.exit(failures === 0 ? 0 : 1);
