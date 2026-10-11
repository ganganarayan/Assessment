/**
 * A fresh person per case.
 *
 * Two reasons, both of them things that bit real runs: the retake lockout is keyed on
 * the respondent's email or mobile, so reusing one identity turns every case after the
 * first into a lockout test; and test rows have to be separable from real ones
 * afterwards, by eye and by query, which an address pattern gives for free.
 *
 * The run id goes in the local part rather than the domain, so every case of one sweep
 * shares a prefix: `qa+<run>-<case>@<domain>`.
 */
import { loadQaEnv } from "../env.js";

export interface Identity {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  /** Free-text answer for any extra opt-in or detail field. */
  text: string;
}

/** Short, sortable, unique enough: minutes since epoch in base 36 plus two random. */
export function newRunId(): string {
  const stamp = Math.floor(Date.now() / 60000).toString(36);
  const salt = Math.random().toString(36).slice(2, 4);
  return `${stamp}${salt}`;
}

/** The prefix every identity of one sweep shares, for cleanup and for eyeballing. */
export function runPrefix(runId: string): string {
  return `qa+${runId}-`;
}

export function identityFor(runId: string, caseId: string, attempt = 1): Identity {
  const { emailDomain, mobilePrefix } = loadQaEnv();
  // Case ids carry option ids and dots; keep the local part to what mail accepts.
  const safeCase = caseId.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40);
  const suffix = attempt > 1 ? `-${attempt}` : "";
  // A mobile has to be digits only and stable per case, so it is derived from the same
  // string rather than random: a rerun of one case reuses its number and meets the
  // lockout, which is exactly what the retake case needs.
  const digits = `${runId}${safeCase}${suffix}`
    .split("")
    .reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 100000, 7)
    .toString()
    .padStart(5, "0");
  return {
    firstName: "QA",
    lastName: safeCase.slice(0, 20) || "Case",
    email: `${runPrefix(runId)}${safeCase}${suffix}@${emailDomain}`,
    mobile: `${mobilePrefix}${digits}`,
    text: "QA harness",
  };
}
