"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { refreshWabaDashboard } from "@/features/whatsapp/dashboard-actions";
import { type DashboardView } from "@/features/whatsapp/dashboard-data";

/**
 * What Meta knows about the connected number.
 *
 * Every panel can be missing, and a missing panel says why rather than rendering a
 * zero. A zero is a number somebody will act on: "0 messages sent" and "Meta would not
 * tell us how many messages were sent" are completely different facts, and only one of
 * them means something is wrong.
 *
 * The figures are a stored snapshot with the time on it, because these edges are rate
 * limited and this is the screen people reload.
 */

const n = (v: number) => v.toLocaleString("en-IN");

/** 🟢 ok, 🟡 needs attention, 🔴 trouble. Meta's words, our dots. */
function dotFor(value: string | null | undefined): string {
  switch ((value ?? "").toUpperCase()) {
    case "GREEN":
    case "AVAILABLE":
    case "CONNECTED":
    case "APPROVED":
    case "VERIFIED":
      return "🟢";
    case "YELLOW":
    case "LIMITED":
    case "PENDING":
    case "PENDING_REVIEW":
    case "AVAILABLE_WITHOUT_REVIEW":
      return "🟡";
    case "RED":
    case "BLOCKED":
    case "RESTRICTED":
    case "FLAGGED":
    case "DECLINED":
    case "REJECTED":
      return "🔴";
    default:
      return "";
  }
}

/** Meta's TIER_1K and friends, in words somebody can act on. */
function describeTier(tier: string | null | undefined): string {
  switch ((tier ?? "").toUpperCase()) {
    case "TIER_50":
      return "50 people a day";
    case "TIER_250":
      return "250 people a day";
    case "TIER_1K":
      return "1,000 people a day";
    case "TIER_10K":
      return "10,000 people a day";
    case "TIER_100K":
      return "100,000 people a day";
    case "TIER_UNLIMITED":
      return "No daily cap";
    default:
      return tier ?? "Not reported";
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm font-medium">{title}</p>
      {children}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

/** A panel Meta refused. Says what it said, because that is the actionable part. */
function Missing({ why }: { why: string }) {
  return <p className="text-xs text-[var(--muted-foreground)]">🟡 Meta did not provide this: {why}</p>;
}

export function WabaDashboard({ view, canEdit = true }: { view: DashboardView; canEdit?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = () => {
    setMsg(null);
    start(async () => {
      const r = await refreshWabaDashboard();
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setMsg(
        r.data?.problems
          ? "Updated. " + r.data.problems + " panel(s) were not available, and each says why."
          : "Updated.",
      );
      // The snapshot the server just stored is what this screen reads.
      window.location.reload();
    });
  };

  if (!view.connected) {
    return (
      <div className="rounded-md border border-dashed p-3">
        <p className="text-sm font-medium">No WhatsApp number connected</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          🟡 Connect one in Settings, then this page will show its quality rating, how many people
          you can reach a day, and what the last 30 days cost.
        </p>
      </div>
    );
  }

  const s = view.snapshot;
  const p = s?.problems ?? {};

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            {view.fetchedAt ? `Read from Meta ${view.fetchedAt} IST` : "Never read from Meta"}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {view.window
              ? `Figures cover ${view.window.from} to ${view.window.to} IST.`
              : "Press Refresh to ask Meta for the first time."}
            {view.fetchedAt && view.stale ? " 🟡 Over an hour old." : ""}
          </p>
        </div>
        <Button size="sm" onClick={refresh} disabled={pending || !canEdit}>
          {pending ? "Asking Meta..." : "Refresh"}
        </Button>
      </div>

      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}

      {!s ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Panel title="Can it send right now">
            {s.health ? (
              <>
                <Line
                  label="Overall"
                  value={`${dotFor(s.health.canSendMessage)} ${s.health.canSendMessage ?? "Unknown"}`}
                />
                {s.health.entities.map((e) => (
                  <div key={e.type + e.id} className="flex flex-col gap-1 border-t pt-2">
                    <Line label={e.type.replace(/_/g, " ").toLowerCase()} value={`${dotFor(e.status)} ${e.status}`} />
                    {e.problems.map((why) => (
                      <p key={why} className="text-xs text-[var(--muted-foreground)]">
                        {why}
                      </p>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              <Missing why={p.health ?? "no reason given"} />
            )}
          </Panel>

          <Panel title="The number">
            {s.phone ? (
              <>
                <Line label="Number" value={s.phone.displayPhone || "Not reported"} />
                <Line label="Name" value={s.phone.verifiedName || "Not reported"} />
                <Line
                  label="Quality rating"
                  value={`${dotFor(s.phone.qualityRating)} ${s.phone.qualityRating ?? "Not reported"}`}
                />
                <Line label="Status" value={`${dotFor(s.phone.status)} ${s.phone.status ?? "Not reported"}`} />
                <Line
                  label="Name approval"
                  value={`${dotFor(s.phone.nameStatus)} ${s.phone.nameStatus ?? "Not reported"}`}
                />
                <Line
                  label="On the phone app"
                  value={s.phone.isOnBizApp ? "🟢 Yes, shared with WhatsApp Business" : "No, cloud only"}
                />
              </>
            ) : (
              <Missing why={p.number ?? "no reason given"} />
            )}
          </Panel>

          <Panel title="How many you can reach">
            {s.limits ? (
              <>
                <Line label="Daily limit" value={describeTier(s.limits.messagingLimitTier)} />
                <Line label="Throughput" value={s.limits.throughputLevel ?? "Not reported"} />
                <p className="text-xs text-[var(--muted-foreground)]">
                  The cap counts people you start a conversation with in 24 hours, not messages. It
                  rises on its own as you send well, and falls if your quality rating drops.
                </p>
              </>
            ) : (
              <Missing why={p.limits ?? "no reason given"} />
            )}
          </Panel>

          <Panel title="The account">
            {s.waba ? (
              <>
                <Line label="Name" value={s.waba.name ?? "Not reported"} />
                <Line
                  label="Review"
                  value={`${dotFor(s.waba.accountReviewStatus)} ${s.waba.accountReviewStatus ?? "Not reported"}`}
                />
                <Line label="Timezone" value={s.waba.timezoneId ?? "Not reported"} />
              </>
            ) : (
              <Missing why={p.account ?? "no reason given"} />
            )}
          </Panel>

          <Panel title="Last 30 days">
            {s.messaging ? (
              (() => {
                const sent = s.messaging.reduce((a, d) => a + d.sent, 0);
                const delivered = s.messaging.reduce((a, d) => a + d.delivered, 0);
                return (
                  <>
                    <Line label="Sent" value={n(sent)} />
                    <Line label="Delivered" value={n(delivered)} />
                    <Line
                      label="Delivered share"
                      value={sent ? Math.round((delivered / sent) * 100) + "%" : "Nothing sent"}
                    />
                  </>
                );
              })()
            ) : (
              <Missing why={p.messages ?? "no reason given"} />
            )}
          </Panel>

          <Panel title="Conversations and cost">
            {s.conversations ? (
              <>
                <Line label="Conversations" value={n(s.conversations.conversations)} />
                <Line label="Cost" value={s.conversations.cost.toFixed(2)} />
                <p className="text-xs text-[var(--muted-foreground)]">
                  🟡 Cost is in your WhatsApp billing currency, which Meta does not name on this
                  figure. Check it against your Meta billing page before relying on it.
                </p>
              </>
            ) : (
              <Missing why={p.conversations ?? "no reason given"} />
            )}
          </Panel>

          <Panel title="Cost by category">
            {s.pricing ? (
              s.pricing.length ? (
                <>
                  {s.pricing.map((r) => (
                    <Line
                      key={r.category}
                      label={r.category.replace(/_/g, " ").toLowerCase()}
                      value={`${n(r.volume)} messages, ${r.cost.toFixed(2)}`}
                    />
                  ))}
                </>
              ) : (
                <p className="text-xs text-[var(--muted-foreground)]">Nothing billed in this window.</p>
              )
            ) : (
              <Missing why={p.cost ?? "no reason given"} />
            )}
          </Panel>

          <Panel title="Per template">
            {s.templates ? (
              s.templates.length ? (
                <>
                  {s.templates.slice(0, 10).map((t) => (
                    <Line
                      key={t.templateId}
                      label={t.templateId}
                      value={`${n(t.sent)} sent, ${n(t.read)} read, ${n(t.clicked)} clicked`}
                    />
                  ))}
                  <p className="text-xs text-[var(--muted-foreground)]">
                    🟡 Meta keeps reads and clicks for about 7 days, so older sends show zero reads.
                  </p>
                </>
              ) : (
                <p className="text-xs text-[var(--muted-foreground)]">No template sends in this window.</p>
              )
            ) : (
              <>
                <Missing why={p.templates ?? "no reason given"} />
                <p className="text-xs text-[var(--muted-foreground)]">
                  🔴 This usually means template insights are off for your account. Turning them on
                  is permanent and cannot be undone, so it is not done from here: do it yourself in
                  WhatsApp Manager if you want per-template figures.
                </p>
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
