/**
 * Judge pass for the AI statement eval. The code checks in score.ts catch what a
 * pattern can catch; this catches what only reading can: a sentence that explains the
 * link between the two answers, reassures, or uses answers the person did not give.
 *
 * Kept honest two ways: the judge must QUOTE the sentence behind every issue, and an
 * issue whose quote is not found verbatim in the statement is dropped. So a verdict can
 * only ever point at words that are really there.
 */
import type { EvalInput } from "./score.js";

export const JUDGE_MODEL = "claude-opus-5-5";

export interface JudgeIssue {
  rule: string;
  quote: string;
}

export interface JudgeVerdict {
  clean: boolean;
  issues: JudgeIssue[];
  /** 1 to 5: how clearly this could only have been written for this one person. */
  specific: number | null;
  dropped: number;
  error?: string;
}

const RUBRIC = `You audit one short statement shown to a person right after an assessment, above a video. The statement's only job is to get them to press play. Judge it ONLY against these rules:

explains: it says WHY, gives a cause, a meaning, or an interpretation, or states what connects the two answers (one causes the other, they are the same thing, they share a root; for example "that is one system rearranging itself", "the thing that needs you is the thing you cannot feel"). Placing the two answers side by side and saying both are true at once is REQUIRED by the statement's brief and is never "explains". Restating an answer in different words is not "explains" either.
reassures: it comforts, reassures or encourages.
advises: it gives advice, a fix, or any next step other than pressing play (a call, booking, session, rest, holiday, a break, even to say it will not help).
not_their_answers: it states something about the person that is FALSE given the data: an answer they did not give, a wrong strength of answer, or an answer that is not among their highest-scoring ones. A remark that two answers were their strongest or most severe is true when the data shows it, and is not an issue.
generic: a sentence that would fit almost anyone, with nothing taken from their answers. The closing handoff to the video and the play button is required and never counts as generic.
labels: it uses a diagnosis or clinical word, a category name, or a band name.
metaphors: more than one metaphor.

For every rule that is broken, copy the exact words from the statement that break it. Copy them character for character. Do not report anything you cannot quote.

Also give "specific": 1 to 5, where 5 means the statement could only have been written for this person's answers and 1 means it is generic.

Reply with JSON only, no other text:
{"issues":[{"rule":"explains","quote":"..."}],"specific":4}`;

function dataBlock(input: EvalInput): string {
  return input.categories
    .map((c) =>
      [`- ${c.name}`, ...(c.questions ?? []).map((q) => `    - ${q.text} -> "${q.answer ?? ""}" (${q.score}/${q.max})`)].join("\n"),
    )
    .join("\n");
}

export async function judgeStatement(apiKey: string, input: EvalInput, statement: string): Promise<JudgeVerdict> {
  const user = `The person's answers (score / max per answer; higher = more severe):\n${dataBlock(input)}\n\nThe statement:\n<<<\n${statement}\n>>>`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: JUDGE_MODEL, max_tokens: 4000, system: RUBRIC, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(180_000),
    });
    const body = await res.text();
    if (!res.ok) return { clean: false, issues: [], specific: null, dropped: 0, error: `${res.status} ${body.slice(0, 200)}` };
    const data = JSON.parse(body) as { content?: Array<{ type?: string; text?: string }> };
    const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { issues?: JudgeIssue[]; specific?: number };
    const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
    const hay = norm(statement);
    const all = (parsed.issues ?? []).filter((i) => i && typeof i.quote === "string" && typeof i.rule === "string");
    const kept = all.filter((i) => i.quote.trim().length > 0 && hay.includes(norm(i.quote)));
    return { clean: kept.length === 0, issues: kept, specific: typeof parsed.specific === "number" ? parsed.specific : null, dropped: all.length - kept.length };
  } catch (e) {
    return { clean: false, issues: [], specific: null, dropped: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
