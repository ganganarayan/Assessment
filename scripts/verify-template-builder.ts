/**
 * Round-trip verification for the TEMPLATE BUILDER's settings mapping.
 *
 * The template builder renders the real settings form against a template's `body` and
 * writes the edited values straight back onto it. Between those two acts sits
 * features/templates/builder-doc.ts, and if that module loses a field then the owner
 * opens a template to fix one question and saves away a result page.
 *
 * So this proves three things, with no database:
 *
 *  1. IDENTITY. Every one of the built-in documents, read into the form and written
 *     back with no edit, comes out BYTE-IDENTICAL - same keys, same null-versus-absent,
 *     same order. Not "equivalent": identical.
 *  2. EVERY FIELD IS REALLY EDITABLE. Each settings field in turn is changed, saved and
 *     read back. The change must survive, and nothing else may move. A field that reads
 *     but never writes is the failure mode a human reviewer cannot see, because the
 *     editor looks right until the save is reloaded.
 *  3. AN EDIT CANNOT PRODUCE AN INVALID TEMPLATE. Every written body is re-validated
 *     with the same schemas the seeder and the import path use.
 *
 * The mutation table below is checked against the live settings shape at run time, so
 * adding a field to `assessmentSchema` fails this script until the field has a case
 * here. That is deliberate: the type-level guards in builder-doc.ts prove a field is
 * WIRED, and only this proves it actually survives a save.
 *
 *   npx tsx --conditions=react-server scripts/verify-template-builder.ts
 */
import {
  settingsFromBody,
  settingsToBody,
  UNCARRIED_SETTINGS,
  type TemplateSettings,
} from "../src/features/templates/builder-doc";
import { assessmentBodyExport, type AssessmentBodyExport } from "../src/features/assessment/transfer/schema";
import { templateDocSchema } from "../src/features/templates/schema";
import { BUILTIN_TEMPLATE_DOCS } from "../src/features/templates/builtin";

let failures = 0;
const ok = (name: string) => console.log(`  PASS  ${name}`);
const fail = (name: string, detail: string) => {
  failures += 1;
  console.log(`  FAIL  ${name}\n        ${detail}`);
};

/** Recursive key-sorted stringify, so a comparison ignores key ORDER but not keys. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = canon(actual);
  const e = canon(expected);
  if (a === e) ok(name);
  else fail(name, `expected ${e}\n        actual   ${a}`);
}

/** Which top-level keys differ between two bodies, and how. For a readable failure. */
function diffKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    const inA = k in a;
    const inB = k in b;
    if (inA !== inB) {
      out.push(`${k}: ${inA ? "present -> ABSENT" : "absent -> PRESENT"}`);
      continue;
    }
    if (canon(a[k]) !== canon(b[k])) out.push(`${k}: ${canon(a[k])} -> ${canon(b[k])}`);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 1. Identity: the 26 built-ins survive an open-and-save untouched           */
/* -------------------------------------------------------------------------- */

const bodies: { slug: string; body: AssessmentBodyExport }[] = [];

for (const raw of BUILTIN_TEMPLATE_DOCS) {
  const slug = typeof (raw as { slug?: unknown }).slug === "string" ? (raw as { slug: string }).slug : "(unnamed)";
  const parsed = templateDocSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    fail(`built-in ${slug} · parses`, `${i?.message ?? "invalid"}${i?.path?.length ? ` at ${i.path.join(".")}` : ""}`);
    continue;
  }
  // The RAW body, not the zod-parsed one: zod fills in defaults, and the stored blob the
  // builder actually opens is the raw document. Proving the round trip on the parsed
  // output would quietly excuse every field whose default happens to match.
  const rawBody = (raw as { body: AssessmentBodyExport }).body;
  bodies.push({ slug, body: rawBody });
}

if (bodies.length === 0) fail("built-ins · at least one document loaded", "none parsed");
else ok(`built-ins · ${bodies.length} documents loaded`);

for (const { slug, body } of bodies) {
  const settings = settingsFromBody(body);
  const back = settingsToBody(body, settings);

  // Byte-identical, key order included. `{ ...body }` plus "write only what changed" is
  // what buys this; if it ever fails, some field is being re-encoded on the way past.
  if (JSON.stringify(back) === JSON.stringify(body)) {
    ok(`identity · ${slug}`);
  } else {
    const d = diffKeys(body as unknown as Record<string, unknown>, back as unknown as Record<string, unknown>);
    fail(`identity · ${slug}`, d.length ? d.join("\n        ") : "key order changed");
  }

  // Reading the written body must give back the same settings. Belt and braces: it
  // cannot fail while the line above passes, and it is the property the builder relies
  // on when it saves, re-reads and re-renders.
  eq(`identity re-read · ${slug}`, settingsFromBody(back), settings);

  /**
   * And again on the PARSED body, which is what the builder is actually handed.
   *
   * The page validates the stored document before opening it, so the builder receives
   * zod's output - every default filled in. That is a different object from the raw
   * file, and it is the one an edit is made against, so the round trip has to hold for
   * it too. (The save action has normalized through this same schema since long before
   * the builder existed, which is why feeding the builder the parsed shape changes
   * nothing about what ends up stored.)
   */
  const parsedBody = assessmentBodyExport.safeParse(body);
  if (!parsedBody.success) {
    fail(`identity parsed · ${slug}`, "body does not parse");
  } else {
    const p = parsedBody.data;
    const pBack = settingsToBody(p, settingsFromBody(p));
    if (JSON.stringify(pBack) === JSON.stringify(p)) ok(`identity parsed · ${slug}`);
    else
      fail(
        `identity parsed · ${slug}`,
        diffKeys(p as unknown as Record<string, unknown>, pBack as unknown as Record<string, unknown>).join("\n        "),
      );
  }
}

/* -------------------------------------------------------------------------- */
/* 2. An adversarial body: absent keys, nulls, and non-default everything     */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately mixes the three ways this format says "nothing": an absent key, an
 * explicit `null`, and a present-but-empty value. The built-ins do not cover all three
 * on every field, and the whole risk in this mapping is collapsing them into one.
 */
const sparse = {
  title: "Sparse",
  slug: "sparse",
  description: null,
  collectFirstName: true,
  firstNameRequired: true,
  collectLastName: false,
  lastNameRequired: false,
  collectEmail: true,
  emailRequired: true,
  collectMobile: false,
  mobileRequired: false,
  collectProfession: true,
  professionRequired: true,
  categories: [
    {
      name: "Only category",
      displayOrder: 0,
      questions: [
        {
          text: "One question",
          weight: 1,
          required: true,
          displayOrder: 0,
          options: [
            { label: "Yes", value: 2, displayOrder: 0 },
            { label: "No", value: 0, displayOrder: 1 },
          ],
        },
      ],
    },
  ],
  resultBands: [
    { level: "LOW" as const, title: "Low", minScore: 0, maxScore: 50, displayOrder: 0 },
    { level: "HIGH" as const, title: "High", minScore: 51, maxScore: 100, displayOrder: 1 },
  ],
} as unknown as AssessmentBodyExport;

{
  const settings = settingsFromBody(sparse);
  const back = settingsToBody(sparse, settings);
  if (JSON.stringify(back) === JSON.stringify(sparse)) ok("identity · sparse body (absent + null + empty)");
  else
    fail(
      "identity · sparse body (absent + null + empty)",
      diffKeys(sparse as unknown as Record<string, unknown>, back as unknown as Record<string, unknown>).join("\n        "),
    );

  // An absent optional must not be invented just because the form carries a default for
  // it. This is the test that would have caught "every save adds thirty keys".
  eq("sparse · no keys invented", Object.keys(back).sort(), Object.keys(sparse).sort());

  // The fields the transfer shape cannot carry read as their fixed values, and writing
  // them back must put nothing on the body.
  eq("uncarried · autoAdvanceLastScreen reads false", settings.autoAdvanceLastScreen, false);
  eq("uncarried · adAccountId reads blank", settings.adAccountId, "");
  const withUncarried = settingsToBody(sparse, {
    ...settings,
    autoAdvanceLastScreen: true,
    resultLinkShowsResult: true,
    aiPromptVersionId: "pv_1",
    adAccountId: "ad_1",
  });
  eq("uncarried · editing them writes nothing", JSON.stringify(withUncarried), JSON.stringify(sparse));
}

/* -------------------------------------------------------------------------- */
/* 3. Every settings field survives an edit                                   */
/* -------------------------------------------------------------------------- */

/**
 * One alternative value per editable field, valid for that field's own rules (a URL
 * field gets a URL, a slug gets a slug) and guaranteed to differ from what is there.
 *
 * Takes the current value so a case can flip rather than guess: a fixed constant that
 * happened to equal the template's value would make the test pass without proving
 * anything.
 */
const MUTATIONS: Record<string, (current: unknown) => unknown> = {
  title: (v) => (v === "Edited title" ? "Another title" : "Edited title"),
  slug: (v) => (v === "edited-slug" ? "edited-slug-two" : "edited-slug"),
  description: (v) => (v === "Edited description" ? "Other description" : "Edited description"),
  eyebrow: (v) => (v === "Edited eyebrow" ? "Other eyebrow" : "Edited eyebrow"),
  subheadline: (v) => (v === "Edited subheadline" ? "Other subheadline" : "Edited subheadline"),
  qualifiedNote: (v) => (v === "Edited note" ? "Other note" : "Edited note"),
  thankYouMessage: (v) => (v === "Edited thanks" ? "Other thanks" : "Edited thanks"),
  introNotice: (v) => (v === "Edited notice" ? "Other notice" : "Edited notice"),
  preResultHeading: (v) => (v === "Edited heading" ? "Other heading" : "Edited heading"),
  preResultSubtext: (v) => (v === "Edited subtext" ? "Other subtext" : "Edited subtext"),
  paymentHeadline: (v) => (v === "Edited pay headline" ? "Other pay headline" : "Edited pay headline"),
  paymentIntroText: (v) => (v === "Edited pay intro" ? "Other pay intro" : "Edited pay intro"),
  startButtonLabel: (v) => (v === "Begin" ? "Start now" : "Begin"),
  resultsButtonLabel: (v) => (v === "See results" ? "Show results" : "See results"),
  paymentButtonLabel: (v) => (v === "Pay now" ? "Pay" : "Pay now"),
  resultsContinueLabel: (v) => (v === "Continue" ? "Next step" : "Continue"),
  firstNameLabel: (v) => (v === "Your name" ? "First name" : "Your name"),
  lastNameLabel: (v) => (v === "Surname" ? "Last name" : "Surname"),
  emailLabel: (v) => (v === "Your email" ? "Email" : "Your email"),
  mobileLabel: (v) => (v === "Your mobile" ? "Mobile" : "Your mobile"),
  professionLabel: (v) => (v === "Your work" ? "Profession" : "Your work"),
  professionPlaceholder: (v) => (v === "Pick one" ? "Choose one" : "Pick one"),
  buttonColor: (v) => (v === "#16a34a" ? "#2563eb" : "#16a34a"),
  buttonTextColor: (v) => (v === "#ffffff" ? "#000000" : "#ffffff"),
  heatmapCode: (v) => (v === "<script>a()</script>" ? "<script>b()</script>" : "<script>a()</script>"),
  paymentReturnParam: (v) => (v === "ref" ? "token" : "ref"),
  paymentEventName: (v) => (v === "Purchase121" ? "PurchaseX" : "Purchase121"),
  coverImageUrl: (v) =>
    v === "https://cdn.example.com/a.png" ? "https://cdn.example.com/b.png" : "https://cdn.example.com/a.png",
  trainingUrl: (v) => (v === "https://vsl.example.com/" ? "https://vsl2.example.com/" : "https://vsl.example.com/"),
  targetUrl: (v) => (v === "https://dest.example.com/" ? "https://dest2.example.com/" : "https://dest.example.com/"),
  resultsContinueUrl: (v) =>
    v === "https://next.example.com/" ? "https://next2.example.com/" : "https://next.example.com/",
  paymentUrl: (v) => (v === "https://pay.example.com/" ? "https://pay2.example.com/" : "https://pay.example.com/"),
  estimatedMinutes: (v) => (v === 9 ? 11 : 9),
  tokenTtlSeconds: (v) => (v === 3600 ? 7200 : 3600),
  paymentAmount: (v) => (v === 499 ? 599 : 499),
  retakeDays: (v) => (v === 20 ? 21 : 20),
  vslCountdownSeconds: (v) => (v === 5 ? 6 : 5),
  collectFirstName: (v) => !v,
  firstNameRequired: (v) => !v,
  collectLastName: (v) => !v,
  lastNameRequired: (v) => !v,
  collectEmail: (v) => !v,
  emailRequired: (v) => !v,
  collectMobile: (v) => !v,
  mobileRequired: (v) => !v,
  collectProfession: (v) => !v,
  professionRequired: (v) => !v,
  leadCaptureAfter: (v) => !v,
  useAiStatement: (v) => !v,
  fireMetaCapi: (v) => !v,
  platformSignup: (v) => !v,
  leadCaptureMode: (v) => (v === "SPLIT" ? "ALL_AT_ONCE" : "SPLIT"),
  retakePolicy: (v) => (v === "NEVER" ? "DELAYED" : "NEVER"),
  uniqueIdentifier: (v) => (v === "MOBILE" ? "EMAIL" : "MOBILE"),
  questionDisplayMode: (v) => (v === "SINGLE" ? "ALL" : "SINGLE"),
  engine: (v) => (v === "CLINIC_AUDIT" ? "GENERIC" : "CLINIC_AUDIT"),
  nextStep: (v) => (v === "RESULTS" ? "DESTINATION" : "RESULTS"),
  professionOptions: (v) => (Array.isArray(v) && v.length === 2 ? ["Coach"] : ["Coach", "Healer"]),
  preResultFields: (v) =>
    Array.isArray(v) && v.length === 1
      ? [{ id: "f2", label: "State", type: "text", options: [], required: true }]
      : [{ id: "f1", label: "City", type: "text", options: [], required: false }],
  optinFields: (v) =>
    Array.isArray(v) && v.length === 1
      ? [{ id: "o2", label: "Budget", type: "select", options: ["Low", "High"], required: true }]
      : [{ id: "o1", label: "Company", type: "text", options: [], required: false }],
  metaEvents: (v) => {
    const cur = v as Record<string, boolean>;
    return { ...cur, registration: !cur.registration };
  },
  audienceGate: (v) => {
    const cur = v as { roles: { id: string; label: string; target: string }[] };
    return cur.roles.length === 1
      ? { ...cur, roles: [{ id: "r1", label: "Healer", target: "" }] }
      : { ...cur, roles: [{ id: "r1", label: "Coach", target: "" }] };
  },
};

/** nextStep carries paidMode with it on purpose. Any other pairing is a bug. */
const ALLOWED_COMPANION_KEYS: Record<string, readonly string[]> = { nextStep: ["paidMode"] };

{
  // Checked against the live shape rather than a list someone remembered to update.
  const probe = settingsFromBody(bodies[0]?.body ?? sparse);
  const editable = Object.keys(probe).filter((k) => !(k in UNCARRIED_SETTINGS));
  const missing = editable.filter((k) => !(k in MUTATIONS));
  const extra = Object.keys(MUTATIONS).filter((k) => !editable.includes(k));
  if (missing.length) fail("mutation table · covers every editable field", `no case for: ${missing.join(", ")}`);
  else ok(`mutation table · covers all ${editable.length} editable fields`);
  if (extra.length) fail("mutation table · no stale cases", `no such field: ${extra.join(", ")}`);
  else ok("mutation table · no stale cases");
}

/**
 * Run the sweep against a body that already carries a value for nearly everything, and
 * against the sparse one where most keys are absent. The two halves fail differently: a
 * present key tests "the change is written", an absent key tests "the key is created".
 */
const sweepTargets: { label: string; body: AssessmentBodyExport }[] = [
  { label: "sparse", body: sparse },
  ...(bodies[0] ? [{ label: bodies[0].slug, body: bodies[0].body }] : []),
];

for (const { label, body } of sweepTargets) {
  const base = settingsFromBody(body);
  let swept = 0;
  const problems: string[] = [];

  for (const [key, mutate] of Object.entries(MUTATIONS)) {
    const nextValue = mutate((base as unknown as Record<string, unknown>)[key]);
    const edited = { ...(base as unknown as Record<string, unknown>), [key]: nextValue } as unknown as TemplateSettings;
    const written = settingsToBody(body, edited);

    // (a) The edit is still there after a save and a re-read.
    const readBack = (settingsFromBody(written) as unknown as Record<string, unknown>)[key];
    if (canon(readBack) !== canon(nextValue)) {
      problems.push(`${key}: saved ${canon(nextValue)} but read back ${canon(readBack)}`);
      continue;
    }

    // (b) Nothing else moved. The quiet failure this whole file exists for.
    const moved = diffKeys(
      body as unknown as Record<string, unknown>,
      written as unknown as Record<string, unknown>,
    ).map((d) => d.split(":")[0] ?? d);
    const allowed = new Set<string>([key, ...(ALLOWED_COMPANION_KEYS[key] ?? [])]);
    const collateral = moved.filter((k) => !allowed.has(k));
    if (collateral.length) {
      problems.push(`${key}: also changed ${collateral.join(", ")}`);
      continue;
    }

    // (c) The written body is still a valid template body, so a save cannot be refused
    // because of what the editor itself did.
    const valid = assessmentBodyExport.safeParse(written);
    if (!valid.success) {
      const i = valid.error.issues[0];
      problems.push(`${key}: produced an invalid body - ${i?.message ?? "invalid"}${i?.path?.length ? ` at ${i.path.join(".")}` : ""}`);
      continue;
    }
    swept += 1;
  }

  if (problems.length) fail(`edit sweep · ${label}`, problems.join("\n        "));
  else ok(`edit sweep · ${label} · ${swept} fields survive an edit`);
}

/* -------------------------------------------------------------------------- */
/* 4. The empty-value conventions, stated as tests                            */
/* -------------------------------------------------------------------------- */

{
  const filled = {
    ...sparse,
    description: "Something",
    paymentEventName: "Purchase121",
    estimatedMinutes: 7,
    paidMode: false,
  } as unknown as AssessmentBodyExport;
  const settings = settingsFromBody(filled);

  // Clearing an optional text field writes `null`, which is how every export in the
  // repo spells "nothing" for these.
  const cleared = settingsToBody(filled, { ...settings, description: "" }) as unknown as Record<string, unknown>;
  eq("convention · clearing optional text writes null", cleared.description, null);

  // paymentEventName is optional-but-not-nullable, so clearing it REMOVES the key. A
  // `null` there would fail validation on the next save.
  const noEvent = settingsToBody(filled, { ...settings, paymentEventName: "" }) as unknown as Record<string, unknown>;
  eq("convention · clearing paymentEventName removes the key", "paymentEventName" in noEvent, false);

  // Clearing a number writes null, not 0: zero minutes is a claim, absence is not.
  const noMinutes = settingsToBody(filled, { ...settings, estimatedMinutes: undefined }) as unknown as Record<string, unknown>;
  eq("convention · clearing a number writes null", noMinutes.estimatedMinutes, null);

  // paidMode is derived from nextStep and is the one field an edit may change as a
  // side effect, because the importer recomputes it anyway.
  const paid = settingsToBody(filled, { ...settings, nextStep: "PAYMENT" }) as unknown as Record<string, unknown>;
  eq("convention · nextStep PAYMENT sets paidMode", paid.paidMode, true);

  // ... but only when the document already had the key. A template that never carried
  // paidMode must not grow one.
  const noPaidKey = settingsToBody(sparse, { ...settingsFromBody(sparse), nextStep: "PAYMENT" }) as unknown as Record<string, unknown>;
  eq("convention · paidMode is not invented", "paidMode" in noPaidKey, false);

  // Whitespace-only text is nothing. Stated here so the behaviour is a decision rather
  // than a surprise: the form shows it as empty afterwards, which is what was meant.
  const spaces = settingsToBody(filled, { ...settings, description: "   " }) as unknown as Record<string, unknown>;
  eq("convention · whitespace-only text writes null", spaces.description, null);
}

/* -------------------------------------------------------------------------- */
/* 5. The parts the settings form never touches stay untouched                */
/* -------------------------------------------------------------------------- */

{
  // A body carrying every blob the settings form has no business in. Editing a setting
  // must leave all of them exactly as they were, by reference-equal content.
  const rich = {
    ...sparse,
    qualification: { enabled: true, questions: [{ id: "q1", text: "Budget?", type: "choice", options: [{ id: "o1", label: "Yes" }, { id: "o2", label: "No", disqualifies: true }] }] },
    disqualifiedContent: { exits: [{ key: "exit_1", name: "Wrong fit", mode: "PAGE", heading: "Not a fit" }] },
    resultPage: { blocks: [{ type: "hero", id: "b1" }] },
    resultPagePublished: { blocks: [{ type: "hero", id: "b1" }] },
    publishedPages: { a: 1 },
    engineConfig: { roles: ["leads"] },
    aiInstructions: "Say nothing useful.",
    createdAt: "2026-01-01T00:00:00.000Z",
  } as unknown as AssessmentBodyExport;

  const settings = settingsFromBody(rich);
  const written = settingsToBody(rich, { ...settings, title: "Renamed" }) as unknown as Record<string, unknown>;
  const original = rich as unknown as Record<string, unknown>;

  for (const key of [
    "qualification",
    "disqualifiedContent",
    "resultPage",
    "resultPagePublished",
    "publishedPages",
    "engineConfig",
    "aiInstructions",
    "createdAt",
    "categories",
    "resultBands",
  ]) {
    eq(`pass-through · ${key} survives a settings edit`, written[key], original[key]);
  }
  eq("pass-through · the edit itself landed", written.title, "Renamed");
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
