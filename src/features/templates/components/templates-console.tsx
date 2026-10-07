"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PLAN_IDS } from "@/lib/billing/plans";
import { setTenantPlanGrant } from "@/features/platform/actions";
import {
  setTemplatePublished,
  setTemplateOrder,
  updateTemplateMeta,
  approveTemplate,
  rejectTemplate,
  deleteTemplate,
  reseedBuiltinTemplates,
} from "@/features/templates/actions/templates";
import { SHAPE_LABELS, TEMPLATE_CATEGORIES } from "@/features/templates/schema";
import { type TemplateListItem } from "@/features/templates/data";
import { type ContributionRewardView } from "@/features/templates/types";

/**
 * The platform owner's Template Library console.
 *
 * Two jobs on one screen, and they are kept visually apart because they are different
 * decisions: REVIEW (a contribution is waiting, accept or decline it) and SHELF
 * (what is published, in what order, worded how).
 *
 * The reward for an accepted contribution is granted through the EXISTING plan-grant
 * mechanism, not a second one. Approving opens a small panel with the contributor's
 * current credit date already filled in, so extending it is one date and one click -
 * and it is still the same action the Platform console uses, so there is one place
 * where access is decided.
 */

/** "2026-11-12" for a date input, in IST. */
function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A month from today, in IST - the obvious default extension when there is no
 *  existing credit date to build on. */
function aMonthFromNow(): string {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

type Reward = ContributionRewardView & { capExceeded: boolean; templateTitle: string };

export function TemplatesConsole({ items, canEdit }: { items: TemplateListItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);

  const pending = items.filter((i) => i.reviewStatus === "PENDING");
  const shelf = items.filter((i) => i.reviewStatus !== "PENDING");

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) {
    setMsg(null);
    setBusy(id);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (!r.ok) setMsg({ tone: "bad", text: r.error ?? "Something went wrong." });
      else {
        if (okText) setMsg({ tone: "ok", text: okText });
        router.refresh();
      }
    });
  }

  function doApprove(t: TemplateListItem, override: boolean) {
    setMsg(null);
    setBusy(t.id);
    start(async () => {
      const r = await approveTemplate(t.id, override);
      setBusy(null);
      if (!r.ok) {
        setMsg({ tone: "bad", text: r.error });
        return;
      }
      if (r.data) setReward({ ...r.data, templateTitle: t.title });
      setMsg({ tone: "ok", text: `"${t.title}" is approved and published.` });
      router.refresh();
    });
  }

  function doReject(t: TemplateListItem) {
    const note = prompt(`Why is "${t.title}" not being accepted? The contributor sees this.`);
    if (note === null) return;
    run(t.id, () => rejectTemplate(t.id, note), "Declined, with your note saved.");
  }

  return (
    <div className="flex flex-col gap-6">
      {msg ? (
        <p className={msg.tone === "ok" ? "text-sm text-green-700" : "text-sm text-amber-700"}>{msg.text}</p>
      ) : null}

      {reward ? <RewardPanel reward={reward} onClose={() => setReward(null)} /> : null}

      {pending.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Waiting for review ({pending.length})</CardTitle>
            <p className="text-sm text-[var(--muted-foreground)]">
              Contributed by a workspace. Nobody else can see these until you approve one.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {pending.map((t) => (
              <div key={t.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">{t.summary ?? "No summary."}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {t.category} · {SHAPE_LABELS[t.shape]} · {t.gateQuestions} gate · {t.questions} scored
                    {t.hasAiPrompt ? " · AI instructions" : ""}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    From {t.contributorName ?? "an unnamed workspace"}
                    {t.submittedAt ? ` on ${new Date(t.submittedAt).toLocaleDateString("en-GB")}` : ""}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" onClick={() => doApprove(t, false)} disabled={busy !== null}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => doApprove(t, true)} disabled={busy !== null}>
                      Approve anyway
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => doReject(t)} disabled={busy !== null}>
                      Decline
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">The library ({shelf.length})</CardTitle>
              <p className="text-sm text-[var(--muted-foreground)]">
                Tick Published to put one on every tenant&apos;s dashboard. Order sorts within a category.
              </p>
            </div>
            {canEdit ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  setMsg(null);
                  setBusy("reseed");
                  start(async () => {
                    const r = await reseedBuiltinTemplates();
                    setBusy(null);
                    if (!r.ok) setMsg({ tone: "bad", text: r.error });
                    else if (r.data) {
                      const failed = r.data.failed.length
                        ? ` ${r.data.failed.length} failed: ${r.data.failed.map((f) => `${f.slug} (${f.error})`).join(", ")}`
                        : "";
                      setMsg({
                        tone: r.data.failed.length ? "bad" : "ok",
                        text: `Built-ins re-seeded: ${r.data.created} new, ${r.data.updated} updated.${failed}`,
                      });
                      router.refresh();
                    }
                  });
                }}
              >
                {busy === "reseed" ? "Re-seeding..." : "Re-seed built-ins"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {shelf.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Nothing in the library yet. Press Re-seed built-ins to load the ones shipped with the app.
            </p>
          ) : null}
          {shelf.map((t) => (
            <div key={t.id} className="rounded-lg border p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{t.title}</p>
                    {t.builtin ? <Badge variant="muted">Built-in</Badge> : null}
                    {t.mine === false && t.contributorName ? (
                      <Badge variant="outline">From {t.contributorName}</Badge>
                    ) : null}
                    {t.reviewStatus === "REJECTED" ? <Badge variant="outline">Declined</Badge> : null}
                    {t.published ? <Badge variant="success">Published</Badge> : null}
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)]">{t.summary ?? "No summary."}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {t.category} · {SHAPE_LABELS[t.shape]} · {t.gateQuestions} gate · {t.questions} scored
                    {t.hasAiPrompt ? " · AI instructions" : " · no AI"} · {t.slug}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={t.published}
                        disabled={busy !== null}
                        onChange={(e) => run(t.id, () => setTemplatePublished(t.id, e.target.checked))}
                      />
                      Published
                    </label>
                    <Input
                      type="number"
                      className="h-9 w-20"
                      defaultValue={t.displayOrder}
                      disabled={busy !== null}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (n !== t.displayOrder) run(t.id, () => setTemplateOrder(t.id, n));
                      }}
                      aria-label="Display order"
                    />
                    <Button size="sm" variant="ghost" onClick={() => setEditing(editing === t.id ? null : t.id)}>
                      {editing === t.id ? "Close" : "Edit"}
                    </Button>
                    {!t.builtin ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => {
                          if (!confirm(`Delete "${t.title}" permanently?`)) return;
                          run(t.id, () => deleteTemplate(t.id), "Deleted.");
                        }}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {editing === t.id && canEdit ? (
                <MetaEditor
                  item={t}
                  busy={busy !== null}
                  onSave={(v) => run(t.id, () => updateTemplateMeta(t.id, v), "Saved.")}
                />
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetaEditor({
  item,
  busy,
  onSave,
}: {
  item: TemplateListItem;
  busy: boolean;
  onSave: (v: { title: string; category: string; summary: string }) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [category, setCategory] = useState(item.category);
  const [summary, setSummary] = useState(item.summary ?? "");
  return (
    <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Category</Label>
        <select
          className="h-10 rounded-md border bg-transparent px-3 text-sm"
          value={(TEMPLATE_CATEGORIES as readonly string[]).includes(category) ? category : "__other"}
          onChange={(e) => setCategory(e.target.value === "__other" ? category : e.target.value)}
        >
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {/* A contributor may have typed a category of their own. Keeping it selectable
              means editing the title does not silently re-file their template. */}
          {!(TEMPLATE_CATEGORIES as readonly string[]).includes(category) ? (
            <option value="__other">{category}</option>
          ) : null}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Summary</Label>
        <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div className="sm:col-span-3">
        <Button size="sm" disabled={busy} onClick={() => onSave({ title, category, summary })}>
          Save wording
        </Button>
      </div>
    </div>
  );
}

/**
 * The reward step, shown once right after an approval.
 *
 * It does not grant anything by itself and it never fires on its own: the owner picks a
 * date and presses the button, and that button calls the SAME plan-grant action the
 * Platform console uses. The cap line states what happened rather than what the rule
 * says - "their second this month" is the fact the owner needs, and the override has
 * already been taken by then.
 */
function RewardPanel({ reward, onClose }: { reward: Reward; onClose: () => void }) {
  const [until, setUntil] = useState(dateInputValue(reward.planExpiresAt) || aMonthFromNow());
  const [plan, setPlan] = useState(reward.plan ?? "SIGNAL");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [, start] = useTransition();

  if (!reward.contributorTenantId) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <p className="text-sm">
            &quot;{reward.templateTitle}&quot; is published. It has no contributing workspace on record, so there is
            nothing to credit.
          </p>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Credit {reward.tenantName ?? reward.contributorName ?? "the contributor"}</CardTitle>
        <p className="text-sm text-[var(--muted-foreground)]">
          &quot;{reward.templateTitle}&quot; is live. This is their{" "}
          {reward.acceptedThisMonth === 1 ? "first" : `${reward.acceptedThisMonth}${reward.acceptedThisMonth === 2 ? "nd" : "th"}`}{" "}
          accepted contribution this calendar month
          {reward.capExceeded ? ", which is over the one-per-month cap you chose to override." : "."}
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Plan</Label>
          <select
            className="h-10 rounded-md border bg-transparent px-3 text-sm"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            {PLAN_IDS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Credit period runs to</Label>
          <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-10" />
        </div>
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            start(async () => {
              const r = await setTenantPlanGrant(reward.contributorTenantId!, plan, until);
              setBusy(false);
              setDone(r.ok ? (r.data?.summary ?? "Saved.") : r.error);
            });
          }}
        >
          {busy ? "Saving..." : "Extend their credit"}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Skip
        </Button>
        {done ? <p className="w-full text-sm text-green-700">{done}</p> : null}
      </CardContent>
    </Card>
  );
}
