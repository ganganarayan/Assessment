import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveAiAdminConfig } from "@/lib/settings/config";

/**
 * Pull what the AI providers ACTUALLY billed, one day at a time.
 *
 * WHY THIS EXISTS. The app used to price its own AI calls from a table of published
 * rates. That table is a copy of a price list that changes without telling anyone, so
 * from the day it is written the app tells a second story about its own costs, and the
 * gap between that story and the invoice widens every month until two numbers exist for
 * the same thing and neither can be trusted. This replaces the story with the invoice.
 *
 * THE SHAPE OF THE PROBLEM. The provider bills an ORGANISATION. It has never heard of a
 * tenant, and on a shared account it has not heard of this product either. We are the
 * only ones who know which call belonged to whom. So neither side is sufficient alone:
 *
 *   the provider has the money and none of the attribution,
 *   we have the attribution and none of the money.
 *
 * Both halves are measured, so putting them together needs no price at all:
 *
 *   1. the cost report gives the real spend for a day,
 *   2. the usage report gives that day's tokens, grouped by API key, so a shared
 *      organisation splits by each key's share - which is why separating products by
 *      API key is enough and a separate account is not required,
 *   3. AiUsage rows split OUR share again, across tenants, by tokens we recorded.
 *
 * Every figure downstream is therefore a share of a real invoice line. Rates go stale;
 * shares do not.
 *
 * 🟡 RECONCILED TO THE DAY, NOT THE CALL. The provider bills a day in aggregate, so one
 * statement's cost is always a share and never a receipt. That is the honest limit of
 * this, and the Accounts page says so rather than implying per-call precision.
 *
 * 🔴 ADMIN KEYS ONLY. These endpoints refuse an ordinary API key. Anthropic's admin key
 * starts sk-ant-admin and only an organisation admin can mint one. Nothing here ever
 * generates, so an admin key is never passed to the generation path.
 */

/** A day's billing for one provider, before it is written down. */
export interface CostDay {
  provider: string;
  /** UTC date, "YYYY-MM-DD". The provider's own day boundary, which is what an invoice uses. */
  day: string;
  billedMicroUsd: number;
  /** Tokens on our API key. */
  scopeTokens: number;
  /** Tokens across the whole billed scope. Equal to scopeTokens on a dedicated account. */
  totalTokens: number;
  source: "cost_report" | "estimate";
  note?: string | null;
}

const MICRO = 1_000_000;

/** "YYYY-MM-DD" for a Date, in UTC. */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The most recent day worth pulling.
 *
 * Yesterday, not today: a day is only final once it is over, and the providers
 * themselves warn that usage can take minutes to land. Pulling today would write a
 * partial figure that looks complete, and a partial cost silently understates expense
 * exactly the way the rate table did.
 */
export function lastSettledDay(now: Date = new Date()): string {
  return utcDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

async function readJson(res: Response, label: string): Promise<unknown> {
  if (!res.ok) {
    throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

function sumNumbers(values: unknown[]): number {
  return values.reduce<number>((n, v) => {
    const parsed = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(parsed) ? n + parsed : n;
  }, 0);
}

/**
 * Anthropic: the day's real spend, and the day's tokens grouped by API key.
 *
 * Two calls because they are two endpoints: cost_report has the money and only daily
 * buckets, usage_report has the tokens and can group by api_key_id. The split between
 * products comes from the second.
 */
async function fetchAnthropic(day: string, adminKey: string, apiKeyId: string | null): Promise<CostDay> {
  const headers = {
    "x-api-key": adminKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
  const starting = `${day}T00:00:00Z`;
  const ending = `${day}T23:59:59Z`;

  const costRes = await fetch(
    `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(starting)}&ending_at=${encodeURIComponent(ending)}`,
    { headers, signal: AbortSignal.timeout(30_000) },
  );
  const cost = (await readJson(costRes, "Anthropic cost_report")) as {
    data?: { results?: { amount?: unknown; currency?: string }[] }[];
  };

  // Costs come back as decimal strings in the smallest unit (cents).
  const cents = sumNumbers((cost.data ?? []).flatMap((b) => (b.results ?? []).map((r) => r.amount)));
  const billedMicroUsd = Math.round(cents * 10_000);

  const usageRes = await fetch(
    `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${encodeURIComponent(starting)}&ending_at=${encodeURIComponent(ending)}&bucket_width=1d&group_by[]=api_key_id`,
    { headers, signal: AbortSignal.timeout(30_000) },
  );
  const usage = (await readJson(usageRes, "Anthropic usage_report")) as {
    data?: {
      results?: {
        api_key_id?: string | null;
        uncached_input_tokens?: unknown;
        cache_creation_input_tokens?: unknown;
        cache_read_input_tokens?: unknown;
        output_tokens?: unknown;
      }[];
    }[];
  };

  const rows = (usage.data ?? []).flatMap((b) => b.results ?? []);
  const tokensOf = (r: (typeof rows)[number]): number =>
    sumNumbers([
      r.uncached_input_tokens,
      r.cache_creation_input_tokens,
      r.cache_read_input_tokens,
      r.output_tokens,
    ]);

  const totalTokens = rows.reduce((n, r) => n + tokensOf(r), 0);
  const scopeTokens = apiKeyId
    ? rows.filter((r) => r.api_key_id === apiKeyId).reduce((n, r) => n + tokensOf(r), 0)
    : totalTokens;

  return {
    provider: "claude",
    day,
    billedMicroUsd,
    scopeTokens,
    totalTokens,
    source: "cost_report",
    note: apiKeyId
      ? null
      : "No API key id set, so the whole organisation's bill is counted as this product's.",
  };
}

/**
 * OpenAI: the same two questions, against the organisation endpoints.
 *
 * Buckets are unix seconds and costs come back in dollars as floats, which is the one
 * place rounding has to be deliberate: micro-dollars are integers precisely so summing
 * thousands of these does not drift from the invoice.
 */
async function fetchOpenAi(day: string, adminKey: string, apiKeyId: string | null): Promise<CostDay> {
  const headers = { authorization: `Bearer ${adminKey}`, "content-type": "application/json" };
  const start = Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);
  const end = start + 24 * 60 * 60;

  const costRes = await fetch(
    `https://api.openai.com/v1/organization/costs?start_time=${start}&end_time=${end}&bucket_width=1d`,
    { headers, signal: AbortSignal.timeout(30_000) },
  );
  const cost = (await readJson(costRes, "OpenAI costs")) as {
    data?: { results?: { amount?: { value?: unknown } }[] }[];
  };
  const dollars = sumNumbers(
    (cost.data ?? []).flatMap((b) => (b.results ?? []).map((r) => r.amount?.value)),
  );

  const usageRes = await fetch(
    `https://api.openai.com/v1/organization/usage/completions?start_time=${start}&end_time=${end}&bucket_width=1d&group_by=api_key_id`,
    { headers, signal: AbortSignal.timeout(30_000) },
  );
  const usage = (await readJson(usageRes, "OpenAI usage")) as {
    data?: {
      results?: { api_key_id?: string | null; input_tokens?: unknown; output_tokens?: unknown }[];
    }[];
  };
  const rows = (usage.data ?? []).flatMap((b) => b.results ?? []);
  const tokensOf = (r: (typeof rows)[number]): number => sumNumbers([r.input_tokens, r.output_tokens]);

  const totalTokens = rows.reduce((n, r) => n + tokensOf(r), 0);
  const scopeTokens = apiKeyId
    ? rows.filter((r) => r.api_key_id === apiKeyId).reduce((n, r) => n + tokensOf(r), 0)
    : totalTokens;

  return {
    provider: "openai",
    day,
    billedMicroUsd: Math.round(dollars * MICRO),
    scopeTokens,
    totalTokens,
    source: "cost_report",
    note: apiKeyId ? null : "No API key id set, so the whole organisation's bill is counted as ours.",
  };
}

/**
 * Pull one day for every provider that has an admin key, and store it.
 *
 * Fail-soft PER PROVIDER: one provider's outage must not cost us the other's figures.
 * A provider with no admin key is skipped silently rather than written as zero - a
 * zero would read as "that day cost nothing", which is the sort of confident wrong
 * number this whole module exists to stop producing.
 */
export async function pullAiCostDay(day: string): Promise<{ written: string[]; skipped: string[]; failed: string[] }> {
  const cfg = await resolveAiAdminConfig();
  const written: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  const jobs: { provider: string; run: () => Promise<CostDay> }[] = [];
  if (cfg.claudeAdminKey) {
    jobs.push({ provider: "claude", run: () => fetchAnthropic(day, cfg.claudeAdminKey as string, cfg.claudeApiKeyId) });
  } else {
    skipped.push("claude");
  }
  if (cfg.openAiAdminKey) {
    jobs.push({ provider: "openai", run: () => fetchOpenAi(day, cfg.openAiAdminKey as string, cfg.openAiApiKeyId) });
  } else {
    skipped.push("openai");
  }

  for (const job of jobs) {
    try {
      const d = await job.run();
      await prisma.aiCostDay.upsert({
        where: { provider_day: { provider: d.provider, day: new Date(`${d.day}T00:00:00Z`) } },
        create: {
          provider: d.provider,
          day: new Date(`${d.day}T00:00:00Z`),
          billedMicroUsd: d.billedMicroUsd,
          scopeTokens: d.scopeTokens,
          totalTokens: d.totalTokens,
          source: d.source,
          note: d.note ?? null,
        },
        // Re-pulling a day REPLACES it. The provider is the authority and late-settling
        // usage is normal, so the newest answer wins rather than being added to the old.
        update: {
          billedMicroUsd: d.billedMicroUsd,
          scopeTokens: d.scopeTokens,
          totalTokens: d.totalTokens,
          source: d.source,
          note: d.note ?? null,
          fetchedAt: new Date(),
        },
      });
      written.push(job.provider);
    } catch (e) {
      console.error(`[ai-cost] ${job.provider} ${day}:`, e instanceof Error ? e.message : String(e));
      failed.push(job.provider);
    }
  }

  return { written, skipped, failed };
}

// ourMicroUsd moved to lib/billing/ai-apportion.ts: it is arithmetic, and this module
// is server-only, which put it out of reach of a build-time check. Re-exported here so
// every existing caller keeps working.
export { ourMicroUsd } from "@/lib/billing/ai-apportion";
