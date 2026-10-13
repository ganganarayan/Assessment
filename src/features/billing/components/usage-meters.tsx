import type { UsageSummary } from "@/lib/billing/entitlements";

/**
 * What this workspace has used against what its plan allows.
 *
 * 🔴 WHY IT TOOK THIS LONG. `getUsage` was written with the billing work and had ZERO
 * callers - the numbers were resolved, correct, and shown to nobody. So every limit in
 * the catalog was invisible from inside the product: a tenant could not see that they
 * were two assessments into a cap of two, or 140 responses into 150, and found out by
 * being refused. Two of these four limits only started being enforced on 2026-10-13,
 * which makes showing them the other half of that work rather than a nicety.
 *
 * Four rows, not a dashboard. Each is a number the app will actually stop them on.
 */

/** One row: label, used of limit, and a bar when there is a limit to draw. */
function Meter({
  label,
  used,
  limit,
  unit,
  note,
}: {
  label: string;
  used: number;
  limit: number | null;
  unit?: string;
  note?: string;
}) {
  const unlimited = limit === null;
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  // Amber from 80%, red at the cap - the project's dot convention, as a bar.
  const tone = unlimited ? "bg-green-600" : pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-green-600";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-[var(--muted-foreground)]">
          {unlimited ? (
            <>Unlimited</>
          ) : (
            <>
              <span className="font-semibold text-[var(--foreground)]">{used.toLocaleString()}</span> of{" "}
              {limit.toLocaleString()}
              {unit ? ` ${unit}` : ""}
            </>
          )}
        </span>
      </div>
      {unlimited ? null : (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]"
          role="img"
          aria-label={`${label}: ${used} of ${limit} used`}
        >
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
      )}
      {note ? <p className="text-xs text-[var(--muted-foreground)]">{note}</p> : null}
    </div>
  );
}

export function UsageMeters({ usage }: { usage: UsageSummary }) {
  // The platform and internal-unlimited scopes are not rated against the catalog, so
  // there is nothing to meter and four "Unlimited" rows would just be noise.
  if (usage.isPlatform) return null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">This period</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          What your plan allows, and what you have used. Disqualified visitors are not
          counted here - they never were, which is the point.
        </p>
      </div>

      <Meter
        label="Qualified responses"
        used={usage.responses.used}
        limit={usage.responses.limit}
        note={
          usage.responses.limit !== null && usage.responses.used >= usage.responses.limit
            ? "Past the cap, answers are still captured and new results are held. Raising the plan unlocks every held lead at once."
            : undefined
        }
      />
      <Meter label="Scorecards" used={usage.assessments.used} limit={usage.assessments.limit} />
      <Meter label="Users" used={usage.seats.used} limit={usage.seats.limit} />
      <Meter
        label="Ad accounts"
        used={usage.adAccounts.used}
        limit={usage.adAccounts.limit}
        note="Each funnel reports to one of these. Set them up under Automation, then Ad accounts."
      />
    </div>
  );
}
