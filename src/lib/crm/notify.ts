import "server-only";

/**
 * CRM automation abstraction (MVP).
 *
 * On submission completion we emit a normalized payload to an outbound webhook
 * (e.g. MyAppZ automation) configured via CRM_WEBHOOK_URL. Intentionally NOT a
 * full integration — just a single, swappable dispatch point. Failures are
 * swallowed so a CRM outage never blocks a respondent's result.
 */

export interface SubmissionCompletedPayload {
  submissionId: string;
  completedAt: string;
  assessment: {
    id: string;
    slug: string;
    title: string;
  };
  lead: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    mobile: string | null;
  };
  scores: {
    total: number;
    max: number;
    /** total/max as a 0–100 percentage; the basis used for result-band matching. */
    percentage: number;
    categories: Array<{
      categoryId: string;
      name: string;
      score: number;
      maxScore: number;
    }>;
  };
  result: {
    level: string;
    title: string;
    description: string | null;
  } | null;
}

/** Dispatch the submission payload to the configured CRM webhook. */
export async function notifySubmissionCompleted(
  payload: SubmissionCompletedPayload,
): Promise<{ delivered: boolean }> {
  const url = process.env.CRM_WEBHOOK_URL;

  if (!url) {
    console.log(
      `[crm] CRM_WEBHOOK_URL not configured; skipping dispatch for ${payload.submissionId}`,
    );
    return { delivered: false };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[crm] dispatch failed: ${res.status} ${res.statusText}`);
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    console.error("[crm] dispatch error", err);
    return { delivered: false };
  }
}
