import {
  listLifecyclePlans,
  lifecycleSummary,
  approveLifecyclePlan,
  skipLifecyclePlan,
  runLifecyclePlannerNow,
  setLifecycleLive,
  sendLifecycleNow,
} from "@/features/platform/lifecycle";
import { isFeatureReleased } from "@/lib/features/release";
import { LIFECYCLE_STAGES } from "@/lib/lifecycle/stages";
import { type LifecyclePlanRow } from "@/features/platform/lifecycle-types";

export const dynamic = "force-dynamic";

/**
 * Trial lifecycle: what the engine decided this morning, and the queue of rows it
 * would not decide on its own.
 *
 * Platform only. These are the product's own trial signups, and the whole screen is
 * the answer to "what is about to be said to my customers in my name".
 */

const STATUS_DOT: Record<string, string> = {
  NEEDS_INPUT: "🟡",
  DRAFT: "🟢",
  APPROVED: "🟢",
  SKIPPED: "⚪",
  SENT: "🟢",
  FAILED: "🔴",
};

export default async function LifecyclePage() {
  const [rows, summary, released] = await Promise.all([
    listLifecyclePlans(),
    lifecycleSummary(),
    isFeatureReleased("lifecycle"),
  ]);

  const waiting = rows.filter((r) => r.status === "NEEDS_INPUT");
  const rest = rows.filter((r) => r.status !== "NEEDS_INPUT");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Trial lifecycle</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Every morning at 06:00 IST this reads what each trialling workspace has done and writes one
          message per person, due at their own 24 hour mark. It does not send yet.
        </p>
      </div>

      {released ? null : (
        <p className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
          🟡 Held back by the release switch. The planner writes nothing until it is turned on under
          Feature releases.
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-3">
        <p className="text-sm">
          {summary.live
            ? "🟡 Sending is LIVE. Plans written from now on go out at each person's own 24 hour mark, unattended."
            : "🔴 Dry run. Nothing on this page has been sent to anybody."}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Turning this on does not release the backlog. Every plan written while it was off carries
          its own dry-run stamp and stays unsent, however it is approved.
        </p>
        <form action={setLifecycleLive} className="flex items-center gap-2">
          {/* An unchecked box posts nothing, so "off" is the absence of the field and
              the submit button is the only thing that commits either way. */}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="live" defaultChecked={summary.live} />
            Let the engine send without me
          </label>
          <button
            type="submit"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium"
          >
            Save
          </button>
        </form>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["In sequence", summary.active],
          ["Waiting on you", summary.needsInput],
          ["Planned 24h", summary.plannedToday],
          ["Model decided", summary.byModel],
          ["Tokens 24h", summary.tokens],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-[var(--border)] px-3 py-2">
            <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
            <div className="text-lg font-semibold">{value}</div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <form action={runLifecyclePlannerNow}>
          <button
            type="submit"
            className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)]"
          >
            Plan now
          </button>
        </form>
        <form action={sendLifecycleNow}>
          <button
            type="submit"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium"
          >
            Send what is due
          </button>
        </form>
        <span className="text-xs text-[var(--muted-foreground)]">
          Both are safe to press twice. Anybody already planned today is left alone, and a claimed
          row cannot be sent a second time.
        </span>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Waiting on you ({waiting.length})</h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nothing to answer. The engine decided every row on its own.
          </p>
        ) : (
          waiting.map((r) => <PlanCard key={r.id} row={r} editable />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recently planned</h2>
        {rest.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Nothing planned yet.</p>
        ) : (
          rest.map((r) => <PlanCard key={r.id} row={r} editable={false} />)
        )}
      </section>

      <section className="flex flex-col gap-2 border-t pt-6">
        <h2 className="text-lg font-semibold">The stages it may choose from</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Fixed in code. The model picks one of these and writes the words; it cannot invent a
          thirteenth. {LIFECYCLE_STAGES.filter((s) => s.channels.waTemplate).length} of{" "}
          {LIFECYCLE_STAGES.length} allow WhatsApp, and that ceiling is deliberate.
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {LIFECYCLE_STAGES.map((s) => (
            <li key={s.key} className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{s.label}</span>
              <span className="text-xs text-[var(--muted-foreground)]">
                days {s.days[0]} to {s.days[1]} ·{" "}
                {s.channels.waTemplate ? `email + ${s.channels.waTemplate}` : "email only"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PlanCard({
  row,
  editable,
}: {
  row: LifecyclePlanRow;
  editable: boolean;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-md border border-[var(--border)] p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-semibold">{row.workspace}</span>
          <span className="text-xs text-[var(--muted-foreground)]">
            Day {row.trialDay} · {row.stage} · due {row.dueAt}
          </span>
        </div>
        <span className="text-xs">
          {STATUS_DOT[row.status] ?? "⚪"} {row.status} · decided by {row.decidedBy}
        </span>
      </header>

      {row.why.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
          {row.why.map((w) => (
            <li key={w} className="rounded border border-[var(--border)] px-2 py-0.5">
              {w}
            </li>
          ))}
        </ul>
      )}

      {row.reason && <p className="text-sm text-[var(--muted-foreground)]">{row.reason}</p>}

      {row.waTemplate && (
        <p className="text-xs">
          WhatsApp template <span className="font-medium">{row.waTemplate}</span> with{" "}
          {row.waVars.map((v) => `"${v}"`).join(", ")}
        </p>
      )}

      {editable ? (
        <form action={approveLifecyclePlan} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={row.id} />
          <input
            name="emailSubject"
            defaultValue={row.emailSubject ?? ""}
            placeholder="Subject"
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
          <textarea
            name="emailBody"
            defaultValue={row.emailBody ?? ""}
            rows={6}
            placeholder="The engine could not write this one. Say what it should have said."
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)]"
            >
              Approve
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-1 text-sm">
          {row.emailSubject && <div className="font-medium">{row.emailSubject}</div>}
          {row.emailBody && (
            <div
              className="text-[var(--muted-foreground)]"
              // The body is HTML the engine wrote against a fixed instruction, stored
              // on our own row and shown only to the owner. It is the same trust
              // boundary as the welcome email template.
              dangerouslySetInnerHTML={{ __html: row.emailBody }}
            />
          )}
        </div>
      )}

      {row.status !== "SKIPPED" && (
        <form action={skipLifecyclePlan} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={row.id} />
          <input
            name="reason"
            placeholder="Why not (optional)"
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium"
          >
            Skip
          </button>
        </form>
      )}
    </article>
  );
}
