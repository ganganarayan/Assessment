/**
 * Does this assessment's audience / profession screen actually render?
 *
 * The column is a JSON blob, and "configured" is not the same as "shown": a gate in
 * dropdown mode with no usable roles renders nothing. The public page already works
 * this out, but it does so while resolving each role's target assessment against the
 * database, which a server action has no reason to do.
 *
 * This is the structural half of that question, with no DB and no async, for callers
 * that need to know whether the audience screen exists - chiefly SPLIT lead capture,
 * which asks for profession on the name screen ONLY when no audience gate already
 * asked the same thing.
 *
 * Deliberately the generous reading: a gate whose every role points at a deleted
 * assessment counts as present here while the page would drop it. Both outcomes are
 * harmless (profession is either asked nowhere or asked once more than needed), and
 * the alternative is duplicating the page's lookups in every caller.
 */
export function audienceGateRenders(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const gate = raw as { mode?: unknown; roles?: unknown };
  if (gate.mode === "FREETEXT") return true;
  if (!Array.isArray(gate.roles)) return false;
  return gate.roles.some(
    (r) =>
      !!r &&
      typeof r === "object" &&
      typeof (r as { label?: unknown }).label === "string" &&
      (r as { label: string }).label.trim().length > 0,
  );
}
