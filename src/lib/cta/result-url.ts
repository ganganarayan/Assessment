/**
 * The full internal result page for a respondent - the link the owner opens to decide
 * whether someone who asked for a call qualifies.
 *
 * Shared by the booking-CTA webhook payload and the owner notification email so the two
 * can never describe different pages: if they drifted, the email and the CRM record for
 * the same click would point somewhere different, and only one of them would be right.
 *
 * Token-bearing, so it opens without a sign-in. Pure, so it is testable without a DB.
 */
export function ctaResultUrl(
  baseUrl: string,
  slug: string,
  submissionId: string,
  resultToken: string | null,
): string {
  const base = `${baseUrl.replace(/\/+$/, "")}/a/${slug}/r/${submissionId}`;
  return resultToken ? `${base}?t=${encodeURIComponent(resultToken)}` : base;
}
