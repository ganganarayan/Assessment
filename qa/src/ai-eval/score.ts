/**
 * Deterministic checks for one AI result statement. PURE: the same text and the same
 * case always give the same verdict, so two models are compared on identical rules.
 *
 * Every check reads the RAW model output, before the app's own post-processing
 * (stripLongDashes), because the question is what the model does when told, not what
 * the app can paper over afterwards.
 */

export interface EvalQuestion {
  text: string;
  answer?: string | null;
  score: number;
  max: number;
}

export interface EvalCategory {
  name: string;
  band?: string | null;
  questions?: EvalQuestion[];
}

export interface EvalInput {
  firstName: string | null;
  scoreRaw: number;
  max: number;
  percentage: number;
  band: string | null;
  categories: EvalCategory[];
}

export interface CheckResult {
  id: string;
  label: string;
  pass: boolean;
  detail?: string;
}

const STOP = new Set(
  "about above after again against also because been before being below between both but cannot could does doing down during each from further have having here hers herself himself into itself just more most myself once only other ought ours ourselves over same should some such than that their theirs them themselves then there these they this those through under until very were what when where which while whom with would your yours yourself yourselves still even every much many never always things thing anything something nothing really feel feels felt".split(
    " ",
  ),
);

function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/u, "");
}

function contentWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z']+/g) ?? [])
    .map((w) => w.replace(/'/g, ""))
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map(stem);
}

export function wordCount(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

/** Answers ranked by severity (score / max), the "two sharpest" rule's raw material. */
export function rankedAnswers(input: EvalInput): Array<EvalQuestion & { category: string; ratio: number }> {
  return input.categories
    .flatMap((c) => (c.questions ?? []).map((q) => ({ ...q, category: c.name, ratio: q.max > 0 ? q.score / q.max : 0 })))
    .sort((a, b) => b.ratio - a.ratio);
}

/** Which answers the statement visibly reflects back, by content-word overlap with the question. */
export function reflectedAnswers(text: string, input: EvalInput): Array<{ text: string; ratio: number; overlap: number }> {
  const said = new Set(contentWords(text));
  const out: Array<{ text: string; ratio: number; overlap: number }> = [];
  for (const q of rankedAnswers(input)) {
    const words = [...new Set(contentWords(`${q.text} ${q.answer ?? ""}`))];
    if (words.length === 0) continue;
    const hit = words.filter((w) => said.has(w)).length;
    const overlap = hit / words.length;
    if (hit >= 3 && overlap >= 0.4) out.push({ text: q.text, ratio: q.ratio, overlap: Math.round(overlap * 100) / 100 });
  }
  return out;
}

// "What this means is named in the video" is the required handoff, so plain "this means" is not here.
const EXPLAIN = /\b(because|which means|meaning that|the reason|that'?s why|that is why|this is why|in other words|that'?s your system|that is your system|is what happens when)\b/i;
const NEXT_STEP = /\b(book|booking|consultation|session|appointment|call me|schedule|sign up|reach out)\b/i;
// "the rest" (the remainder) and "rest of" are ordinary English, not the rest topic.
const REST_TOPIC = /\b((?<!the )rest(?! of)(?:ing)?|holiday|vacation|time off|day off|a break|sabbatical)\b/i;
const HELPLINE = /(tele-?manas|helpline|hotline|\b\d{5,}\b|crisis line|if you ever feel)/i;
const CLINICAL = /\b(burn ?out|burnout|anxiety|anxious disorder|depress\w*|trauma\w*|disorder|ptsd|adrenal)\b/i;
const REASSURE = /\b(you(?:'re| are) not alone|it'?s okay|it is okay|don'?t worry|you(?:'ll| will) be fine|this is fixable|there is hope|you can do this|be kind to yourself)\b/i;
const LONG_DASH = /[\u2013\u2014]/;
const MARKDOWN = /(\*\*|__|^#|^\s*[-*•]\s|`)/m;
const EMOJI = /\p{Extended_Pictographic}/u;

/** The first explaining phrase outside the video handoff, or null. */
function explaining(text: string): string | null {
  for (const sentence of text.split(/(?<=[.?])\s+/)) {
    if (/\b(video|play)\b/i.test(sentence)) continue;
    const m = sentence.match(EXPLAIN);
    if (m) return m[0];
  }
  return null;
}

export function scoreStatement(
  text: string,
  input: EvalInput,
  opts: { minWords: number; maxWords: number; stopReason: string | null },
): CheckResult[] {
  const t = text.trim();
  const words = wordCount(t);
  // The form's first-name field sometimes holds a full name; the first word is what a person is called.
  const first = (input.firstName ?? "").trim().split(/\s+/)[0] ?? "";
  const opening = t.split(/\s+/).slice(0, 6).join(" ").toLowerCase();
  const tail = t.split(/\s+/).slice(-25).join(" ").toLowerCase();
  const reflected = reflectedAnswers(t, input);
  const top = rankedAnswers(input);
  // "The two sharpest" = the two highest-ranked answers, so the bar is the SECOND one's severity.
  const secondRatio = top[1]?.ratio ?? top[0]?.ratio ?? 0;
  const bandNames = [input.band, ...input.categories.map((c) => c.band)].filter((b): b is string => !!b && b.length > 3);
  const catNames = input.categories.map((c) => c.name.replace(/^\d+:\s*/, "")).filter((n) => n.length > 3);
  const names = [...bandNames, ...catNames].filter((n) => t.toLowerCase().includes(n.toLowerCase()));

  const checks: CheckResult[] = [
    { id: "complete", label: "Complete (not cut off)", pass: t.length > 0 && opts.stopReason === "end_turn", detail: opts.stopReason ?? "none" },
    { id: "length", label: `${opts.minWords} to ${opts.maxWords} words`, pass: words >= opts.minWords && words <= opts.maxWords, detail: `${words} words` },
    { id: "name", label: "Opens with their first name", pass: !first || opening.includes(first.toLowerCase()), detail: first ? `name ${first}` : "no name given" },
    { id: "score", label: "Exact score as X out of Y", pass: new RegExp(`\\b${input.scoreRaw}\\s+out\\s+of\\s+${input.max}\\b`, "i").test(t) },
    { id: "play", label: "Ends by pointing to play", pass: /\bplay\b/.test(tail) },
    {
      id: "two-answers",
      label: "Reflects two of the sharpest answers",
      pass: reflected.length >= 2 && reflected.slice(0, 2).every((r) => r.ratio >= secondRatio - 1e-9),
      detail: reflected.map((r) => `${Math.round(r.ratio * 100)}% ${r.text.slice(0, 50)}`).join(" | ") || "none matched",
    },
    // The handoff sentence ("what this means is named in the video") is required, so a
    // sentence that sends them to the video is exempt from the explanation check.
    {
      id: "no-explain",
      label: "No explanation phrase",
      pass: !explaining(t),
      detail: explaining(t) ?? undefined,
    },
    { id: "no-next-step", label: "No call, booking or session", pass: !NEXT_STEP.test(t), detail: t.match(NEXT_STEP)?.[0] },
    { id: "no-rest", label: "No rest or holiday mention", pass: !REST_TOPIC.test(t), detail: t.match(REST_TOPIC)?.[0] },
    { id: "no-helpline", label: "No helpline or number", pass: !HELPLINE.test(t), detail: t.match(HELPLINE)?.[0] },
    { id: "no-clinical", label: "No clinical label", pass: !CLINICAL.test(t), detail: t.match(CLINICAL)?.[0] },
    { id: "no-reassure", label: "No reassurance", pass: !REASSURE.test(t), detail: t.match(REASSURE)?.[0] },
    { id: "no-labels", label: "No band or category names", pass: names.length === 0, detail: names.join(", ") || undefined },
    { id: "no-percent", label: "No percentage", pass: !/\d+\s?%|percent/i.test(t) },
    { id: "clean", label: "No long dash, markdown, emoji or !", pass: !LONG_DASH.test(t) && !MARKDOWN.test(t) && !EMOJI.test(t) && !t.includes("!") },
  ];
  return checks;
}

/** Shared 6-word runs between two statements: a stock line reused across people. */
export function sharedRuns(a: string, b: string, n = 6): string[] {
  const grams = (s: string) => {
    const w = s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
    return out;
  };
  const ga = grams(a);
  return [...grams(b)].filter((g) => ga.has(g));
}
