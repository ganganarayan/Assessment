/**
 * verify:import-sample - the downloadable import sample still describes the real format.
 *
 * WHY THIS EXISTS. A tenant hands the sample to an AI tool and imports whatever comes
 * back. The whole value of generating it is that it cannot go stale - but "generated"
 * only helps if the generator can still read the schema. Two ways it quietly stops:
 *
 *   1. The worked example stops validating, because a field became required or an enum
 *      lost a value. Then every file the tool writes from it fails to import.
 *   2. A field gains a Zod shape the introspector cannot read, so it is described as
 *      "unknown" and the tool is told nothing useful about it. Nothing errors; the
 *      sample just gets vaguer, one field at a time.
 *
 * Both are caught here, at build time, instead of by whoever downloads it next.
 *
 * No DB, no network, no build.
 */
import { buildImportSample, sampleFields } from "../src/features/assessment/transfer/sample";
import { parseDocument } from "../src/features/assessment/transfer/format";
import { assessmentBodyExport } from "../src/features/assessment/transfer/schema";
import { z } from "zod";

let failures = 0;

function expect(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

console.log("Import sample verification\n");

// --- it builds at all ---------------------------------------------------------------
let sample: ReturnType<typeof buildImportSample> | null = null;
try {
  sample = buildImportSample("verify");
  expect("the sample builds", true);
} catch (e) {
  expect("the sample builds", false, e instanceof Error ? e.message : String(e));
}

if (sample) {
  // --- 🔴 the example actually imports ----------------------------------------------
  //
  // The one claim the whole feature makes. buildImportSample checks it too and throws,
  // so reaching here means it passed - but this asserts it independently, through the
  // same parser the Import screen uses, so the check cannot be quietly removed from the
  // generator without a failure here.
  const round = parseDocument(JSON.stringify(sample.example), "json");
  expect(
    "the worked example parses through the real import parser",
    round.ok,
    round.ok ? "" : round.errors.join("; "),
  );
  if (round.ok) {
    expect(
      "and it carries exactly one assessment to copy",
      round.data.assessments.length === 1,
      String(round.data.assessments.length),
    );
    const a = round.data.assessments[0];
    expect("the example has a title", !!a?.title, a?.title ?? "");
    expect("the example has a slug", !!a?.slug, a?.slug ?? "");
    expect("the example has questions to copy", (a?.categories?.length ?? 0) > 0, String(a?.categories?.length));
    expect("the example has result bands", (a?.resultBands?.length ?? 0) > 0, String(a?.resultBands?.length));
  }

  // --- the field reference is complete ----------------------------------------------
  const fields = sample.fields;
  const shapeKeys = Object.keys(
    (assessmentBodyExport._def as { shape: () => Record<string, z.ZodTypeAny> }).shape(),
  );
  expect(
    "every field of the import format is described",
    fields.length === shapeKeys.length,
    `described ${fields.length}, schema has ${shapeKeys.length}`,
  );

  const missing = shapeKeys.filter((k) => !fields.some((f) => f.name === k));
  expect("no field is left out", missing.length === 0, missing.join(", "));

  // 🔴 The quiet failure. A field the introspector cannot read is described as
  // "unknown", which tells the AI tool nothing - and nothing else would ever complain.
  const unknown = fields.filter((f) => f.unknown).map((f) => f.name);
  expect(
    "no field has a shape the sample cannot describe",
    unknown.length === 0,
    unknown.length ? `teach describe() these: ${unknown.join(", ")}` : "",
  );

  // --- enums are spelled out ---------------------------------------------------------
  //
  // An AI tool inventing an enum value is the single most likely way a generated file
  // fails to import, so every enum must arrive with its permitted values.
  const enums = fields.filter((f) => f.type === "enum");
  expect("the format still has enums to pin", enums.length > 0, String(enums.length));
  const emptyEnums = enums.filter((f) => !f.values || f.values.length === 0).map((f) => f.name);
  expect("every enum lists its permitted values", emptyEnums.length === 0, emptyEnums.join(", "));

  // The ones that decide the respondent's whole journey. Named explicitly: if one of
  // these stops being described, a generated file can silently build the wrong funnel.
  for (const key of ["nextStep", "questionDisplayMode", "retakePolicy", "uniqueIdentifier", "leadCaptureMode"]) {
    const f = fields.find((x) => x.name === key);
    expect(`${key} is described with its values`, !!f && (f.values?.length ?? 0) > 0, f ? f.type : "absent");
  }

  // Custom-field types are the thing that actually broke a live assessment, so the
  // instructions must still say which two are allowed.
  const saysFieldTypes = sample.instructions.some(
    (i) => i.includes('"text"') && i.includes('"select"'),
  );
  expect("the instructions still name the only two custom-field types", saysFieldTypes);

  expect("the sample names the build it came from", sample.commit === "verify", sample.commit);
  expect("the sample carries instructions", sample.instructions.length > 0, String(sample.instructions.length));
}

// sampleFields is exported for the reference table; it must agree with the sample.
expect(
  "sampleFields() and the built sample agree",
  !sample || sampleFields().length === sample.fields.length,
);

console.log(
  failures === 0
    ? "\nAll import-sample checks passed.\n"
    : `\n${failures} import-sample check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
