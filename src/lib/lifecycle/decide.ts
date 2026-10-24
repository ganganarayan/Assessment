import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";
import { lifecycleStage } from "@/lib/lifecycle/stages";
import { describeCandidates } from "@/lib/lifecycle/router";
import { type LifecycleFacts } from "@/lib/lifecycle/facts";

/**
 * THE DECISION CALL - the only place a model is asked anything.
 *
 * It is handed a shortlist the router already narrowed, the person's own facts, and a
 * schema. It returns which stage, and the words. It cannot pick a stage outside the
 * shortlist, cannot set a send time, cannot choose a channel the stage does not allow,
 * and cannot return prose instead of JSON without the row being escalated to a human.
 *
 * 🔴 EFFORT IS PINNED LOW, and that is not a quality compromise, it is the bill.
 * Thinking tokens are billed as OUTPUT. Left at the model default this call reasons
 * its way through a decision the router has already reduced to a choice of three, and
 * the output cost triples for no better answer. Low effort is the correct setting for
 * a constrained pick plus 150 words of copy.
 *
 * 🟢 The system block is byte-identical on every call and carries cache_control, so
 * the first person in a nightly run writes the cache and everybody after reads it at
 * a tenth of the input price. Keep the volatile parts in the user message, where they
 * belong, or the cache silently stops working and nobody notices but the invoice.
 *
 * Fail-soft throughout: any error returns null and the planner falls back to the
 * router's first candidate. A model being down must never mean a person hears nothing.
 */

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 1500;
const TIMEOUT_MS = 60_000;

/** What the model is allowed to return. Anything else is a rejected decision. */
const DecisionSchema = z.object({
  action: z.enum(["SEND", "SKIP", "ESCALATE"]),
  stageKey: z.string().min(1),
  emailSubject: z.string().min(1).max(140),
  emailBody: z.string().min(1).max(4000),
  /** Short values for the approved template's numbered slots. Empty = email only. */
  waVars: z.array(z.string().max(120)).max(5),
  reason: z.string().min(1).max(300),
});

export type LifecycleDecision = z.infer<typeof DecisionSchema> & {
  waTemplate: string | null;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

/**
 * THE FIXED HALF OF THE PROMPT. Every byte of this is identical on every call, which
 * is what makes it cacheable. Nothing person-specific may be added here, ever.
 */
const SYSTEM = `You write one message a day to someone trialling Assess360, a lead qualification engine sold to coaches, clinics and agencies.

Your job on each call is to pick ONE stage from the shortlist you are given and write that message. You are not deciding whether to write, when to send, or through which channel. Those are already decided.

HOW TO WRITE
- Write to one person who is busy. Short sentences. No preamble.
- Use their own facts. "You built Clinic Audit on Tuesday and never published it" beats "complete your setup" every time. If you have no specific fact worth naming, the message is too generic and you should pick a different stage.
- One action per message. One link.
- Never use an em dash. Use a comma or a plain hyphen.
- Every date you write is DD-MM-YYYY. Times are IST, written DD-MM-YYYY HH:MM.
- Do not invent facts. If something is not in the facts you were given, it did not happen.
- Do not claim a discount, a deadline or a bonus that is not in the facts.
- British spelling.

THE EMAIL
- Subject: under 60 characters, no colon-prefix formatting, nothing that reads as a mailshot.
- Body: plain HTML, paragraphs and at most one link. 60 to 160 words. No heading tags, no images, no inline styles, no signature block.

THE WHATSAPP SLOTS
- Only fill these when the stage you picked has a WhatsApp template. Otherwise return an empty array.
- Each slot is a SHORT value: a first name, a number, one next step of a few words, nothing longer. They are filling the blanks in a template Meta has already approved.
- A slot is never a sentence of marketing copy and never contains a newline, a URL or an emoji.

WHEN TO ESCALATE
Return action ESCALATE, with the reason, when the facts genuinely do not support any stage on the shortlist, when the facts contradict each other, or when the honest message would be something no stage covers. Escalating is a correct answer and costs nothing. Guessing is the expensive one.

Return ONLY a JSON object, no fence, no commentary:
{"action":"SEND"|"SKIP"|"ESCALATE","stageKey":"...","emailSubject":"...","emailBody":"...","waVars":["..."],"reason":"..."}`;

interface ClaudeResponse {
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** The platform's own Claude key. This engine is the product writing to its customers. */
async function platformClaudeKey(): Promise<string | null> {
  try {
    const s = await prisma.appSetting.findUnique({
      where: { id: "singleton" },
      select: { aiClaudeKeyEnc: true, aiApiKeyEnc: true, aiProvider: true },
    });
    const enc = s?.aiClaudeKeyEnc ?? (s?.aiProvider === "claude" ? s?.aiApiKeyEnc : null);
    if (!enc) return null;
    return decryptWithSecret(enc, env.BETTER_AUTH_SECRET) || null;
  } catch (e) {
    console.error("[lifecycle] key read failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Pull the JSON object out of whatever came back.
 *
 * Deliberately simple: strip a fence if there is one, take the outermost braces, parse.
 * No repair pass. A model that cannot return the shape it was asked for twice in a row
 * is a model whose judgement on this row should not be trusted either, and the row
 * escalating to a human is the right outcome rather than a salvaged guess.
 */
function extractJson(text: string): unknown {
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

async function callClaude(apiKey: string, user: string, withEffort: boolean): Promise<Response> {
  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // The cacheable prefix. An array with cache_control, not a bare string: that is
    // the only form the breakpoint can be attached to.
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  };
  // 🔴 The cost control. Sent separately so a rejection can be retried without it
  // rather than taking the whole night's planning down with it.
  if (withEffort) body.output_config = { effort: "low" };

  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Ask the model which of these stages, and what to say. Null on any failure.
 */
export async function decide(
  facts: LifecycleFacts,
  candidates: string[],
): Promise<LifecycleDecision | null> {
  const apiKey = await platformClaudeKey();
  if (!apiKey) {
    console.error("[lifecycle] no platform Claude key saved, falling back to the router");
    return null;
  }

  const user = [
    "SHORTLIST (pick exactly one stageKey from these):",
    describeCandidates(candidates),
    "",
    "FACTS:",
    JSON.stringify(facts, null, 1),
  ].join("\n");

  try {
    let res = await callClaude(apiKey, user, true);
    if (res.status === 400) {
      // An older API version on the account will not know output_config. Retry once
      // without it: a correct message at full effort beats no message at all, and the
      // log line is how this gets noticed and fixed rather than quietly overspending.
      const detail = (await res.text()).slice(0, 300);
      console.error(`[lifecycle] 400 with effort, retrying without it: ${detail}`);
      res = await callClaude(apiKey, user, false);
    }
    if (!res.ok) {
      console.error(`[lifecycle] Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }

    const data = (await res.json()) as ClaudeResponse;
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    const parsed = DecisionSchema.safeParse(extractJson(text));
    if (!parsed.success) {
      console.error(`[lifecycle] unusable decision: ${parsed.error.issues[0]?.message ?? "bad shape"}`);
      return null;
    }

    // 🔴 THE STAGE IS CHECKED AGAINST THE SHORTLIST, not just against the catalogue.
    // A valid key the router did not offer is still the model going somewhere it was
    // not invited, and the caps that produced that shortlist are the whole safety net.
    const stage = lifecycleStage(parsed.data.stageKey);
    if (!stage || !candidates.includes(parsed.data.stageKey)) {
      console.error(`[lifecycle] stage "${parsed.data.stageKey}" was not on the shortlist`);
      return null;
    }

    // Slots only survive if the stage actually has a template with that many of them.
    const template = stage.channels.waTemplate;
    const waVars =
      template && parsed.data.waVars.length === stage.channels.waSlots ? parsed.data.waVars : [];

    return {
      ...parsed.data,
      waVars,
      waTemplate: waVars.length ? template : null,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      model: MODEL,
    };
  } catch (e) {
    console.error("[lifecycle] decision failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
