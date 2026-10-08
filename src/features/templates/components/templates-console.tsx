"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  getTemplateDocument,
  updateTemplateDocument,
  revertTemplateToRepo,
} from "@/features/templates/actions/templates";
import { SHAPE_LABELS, TEMPLATE_CATEGORIES } from "@/features/templates/schema";
import { repairJson, locateJsonError } from "@/features/templates/json-repair";
import { type TemplateListItem } from "@/features/templates/data";
import { type ContributionRewardView, type TemplateDocumentView } from "@/features/templates/types";

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

/**
 * Download a template to read it.
 *
 * Before this, the only way to see a template's questions was to IMPORT it - which
 * creates a real assessment inside a workspace and spends one of that plan's slots. A
 * side effect that large has no business attaching to the act of checking whether the
 * content is any good, and it meant reviewing a contribution cost something.
 *
 * Two formats because there are two ways to review. The document is what the repo
 * holds, so what is read is exactly what ships. The assessment file loads in the
 * ordinary Import screen, so a reviewer can WALK the funnel instead of reading JSON.
 */
function DownloadTemplate({ id }: { id: string }) {
  return (
    <details className="relative">
      <summary
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer list-none")}
        title="Read this template without importing it"
      >
        Download
      </summary>
      <div className="absolute right-0 z-10 mt-1 flex w-56 flex-col rounded-md border bg-[var(--background)] p-1 text-sm shadow">
        <a href={`/api/admin/templates/${id}/export`} className="rounded px-2 py-1.5 hover:bg-[var(--muted)]">
          Template file
          <span className="block text-[11px] text-[var(--muted-foreground)]">Exactly what the repo holds</span>
        </a>
        <a
          href={`/api/admin/templates/${id}/export?format=assessment`}
          className="rounded px-2 py-1.5 hover:bg-[var(--muted)]"
        >
          As an import file
          <span className="block text-[11px] text-[var(--muted-foreground)]">Load it on Import and walk it</span>
        </a>
      </div>
    </details>
  );
}

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
                <div className="flex shrink-0 items-center gap-2">
                  {/* Available to staff as well as the owner: reading a template is a
                      read, and the actions beside it are already owner-gated. */}
                  <DownloadTemplate id={t.id} />
                  {canEdit ? (
                  <>
                    <Button size="sm" onClick={() => doApprove(t, false)} disabled={busy !== null}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => doApprove(t, true)} disabled={busy !== null}>
                      Approve anyway
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => doReject(t)} disabled={busy !== null}>
                      Decline
                    </Button>
                  </>
                  ) : null}
                </div>
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
                Download any of them to read the questions without importing.
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
                      // `kept` is reported, not hidden. "Nothing changed" and "I left
                      // your edits alone on purpose" are the same number otherwise, and
                      // only one of them is what the owner meant to happen.
                      const kept = r.data.kept
                        ? ` ${r.data.kept} left alone (edited here).`
                        : "";
                      setMsg({
                        tone: r.data.failed.length ? "bad" : "ok",
                        text: `Built-ins re-seeded: ${r.data.created} new, ${r.data.updated} updated.${kept}${failed}`,
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
                {/* The order number leads the row. It is what the list is SORTED by, so
                    reading down the left edge should be reading the order - it sat on
                    the right, past the title and the summary, where the one thing it
                    controls was the hardest thing to scan. */}
                {canEdit ? (
                  <Input
                    type="number"
                    className="h-9 w-16 shrink-0 text-center"
                    defaultValue={t.displayOrder}
                    disabled={busy !== null}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (n !== t.displayOrder) run(t.id, () => setTemplateOrder(t.id, n));
                    }}
                    aria-label={`Display order for ${t.title}`}
                    title="Sort order within the category. Lower sorts first."
                  />
                ) : null}
                <div className="min-w-0 flex-1">
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
                    <DownloadTemplate id={t.id} />
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
                <>
                  <MetaEditor
                    item={t}
                    busy={busy !== null}
                    onSave={(v) => run(t.id, () => updateTemplateMeta(t.id, v), "Saved.")}
                  />
                  <TemplateEditor id={t.id} title={t.title} onChanged={() => router.refresh()} />
                </>
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


/**
 * The Template editor: the whole template as JSON, editable in place.
 *
 * It edits the SAME document the repo files hold and the Download button hands out, so
 * what is edited here is exactly what the seeder would load - one format, not a third
 * one invented for a textarea.
 *
 * Validation runs the same zod schema the seeder and the contribution path use, and a
 * failure names the field. "Invalid JSON" in a nine-hundred-line document is not a
 * message anybody can act on; "Required at body.categories.0.questions.3.options" is.
 *
 * Loaded on demand. Eight bodies is a few hundred kilobytes that nobody is reading
 * until they open one, and shipping all of it with the list would make the screen
 * slower to serve for every visit that never opens a single panel.
 */
function TemplateEditor({ id, title, onChanged }: { id: string; title: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState("");
  const [loaded, setLoaded] = useState<TemplateDocumentView | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [, start] = useTransition();
  /** A repair waiting to be accepted. Never applied without this being shown first. */
  const [offer, setOffer] = useState<{ text: string; fixes: string[] } | null>(null);

  const dirty = loaded !== null && json !== loaded.json;

  function load() {
    setBusy(true);
    setMsg(null);
    start(async () => {
      const r = await getTemplateDocument(id);
      setBusy(false);
      if (!r.ok || !r.data) {
        setMsg({ tone: "bad", text: r.ok ? "Couldn't load it." : r.error });
        return;
      }
      setLoaded(r.data);
      setJson(r.data.json);
      setOpen(true);
    });
  }

  /**
   * Describe a parse failure in terms somebody can act on, and offer the repair when
   * there is one. "Unexpected token } at position 8231" names neither the line nor the
   * mistake; this names both, and then says what it would change.
   */
  function reportBroken(e: unknown) {
    const message = e instanceof Error ? e.message : "parse failed";
    const loc = locateJsonError(json, message);
    const where = loc ? ` Line ${loc.line}: ${loc.lineText.trim().slice(0, 80)}` : "";

    const repaired = repairJson(json);
    if (repaired.parses && repaired.fixes.length > 0) {
      setOffer({ text: repaired.text, fixes: repaired.fixes });
      setMsg({ tone: "bad", text: `That won't parse.${where}` });
      return;
    }
    setOffer(null);
    setMsg({
      tone: "bad",
      text: `That won't parse, and I can't work out the fix safely.${where} ${message}`,
    });
  }

  /** Parse only, so a mistake is caught before it is saved rather than by saving. */
  function check() {
    setOffer(null);
    try {
      const parsed: unknown = JSON.parse(json);
      setJson(JSON.stringify(parsed, null, 2));
      setMsg({ tone: "ok", text: "Valid JSON, and tidied. Save to check it against the template rules." });
    } catch (e) {
      reportBroken(e);
    }
  }

  function save(text: string = json) {
    // Parse HERE first, so a syntax slip becomes an offer to fix it rather than a
    // server round trip that comes back with a rejection and no way forward.
    try {
      JSON.parse(text);
    } catch (e) {
      setBusy(false);
      reportBroken(e);
      return;
    }
    setOffer(null);
    setBusy(true);
    setMsg(null);
    start(async () => {
      const r = await updateTemplateDocument(id, text);
      setBusy(false);
      if (!r.ok) {
        setMsg({ tone: "bad", text: r.error });
        return;
      }
      setJson(text);
      setLoaded((p) => (p ? { ...p, json: text, seedLocked: p.seedLocked || !!r.data?.seedLocked } : p));
      setMsg({
        tone: "ok",
        text: r.data?.seedLocked
          ? "Saved. This one is now edited here, so deploys will leave it alone - use Revert to go back to the shipped version."
          : "Saved.",
      });
      onChanged();
    });
  }

  function revert() {
    if (!confirm(`Put "${title}" back to the version shipped in the code? Your edits here are lost.`)) return;
    setBusy(true);
    setMsg(null);
    start(async () => {
      const r = await revertTemplateToRepo(id);
      setBusy(false);
      if (!r.ok) {
        setMsg({ tone: "bad", text: r.error });
        return;
      }
      const fresh = await getTemplateDocument(id);
      if (fresh.ok && fresh.data) {
        setLoaded(fresh.data);
        setJson(fresh.data.json);
      }
      setMsg({ tone: "ok", text: "Back to the shipped version, and following the code again." });
      onChanged();
    });
  }

  if (!open) {
    return (
      <div className="mt-3 border-t pt-3">
        <Button size="sm" variant="outline" onClick={load} disabled={busy}>
          {busy ? "Opening..." : "Template editor"}
        </Button>
        <span className="ml-2 text-xs text-[var(--muted-foreground)]">
          View and edit the whole template here. Nobody sees a change until it is published.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs">Template editor - {loaded?.slug}</Label>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close editor
        </Button>
      </div>

      {loaded?.builtin ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          {loaded.seedLocked
            ? "Edited here, so deploys no longer overwrite it. Revert puts back the version shipped in the code."
            : "Shipped in the code. The moment you save an edit, this row stops following the code so a deploy cannot undo you."}
        </p>
      ) : null}

      <Textarea
        rows={22}
        value={json}
        onChange={(e) => setJson(e.target.value)}
        spellCheck={false}
        className="font-mono text-xs"
        aria-label="Template JSON"
      />

      {/* The repair is OFFERED, never applied on its own. Silently rewriting somebody's
          content is a worse failure than refusing to save it, because the rewrite is
          the one they will not notice. So: say exactly what would change, and wait. */}
      {offer ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <p className="font-medium">I can fix this. Here is exactly what would change:</p>
          <ul className="mt-1 list-disc pl-5">
            {offer.fixes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-1 text-[var(--muted-foreground)]">
            Nothing inside your questions or answers is touched - only the punctuation holding the
            document together.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setJson(offer.text);
                save(offer.text);
              }}
              disabled={busy}
            >
              Fix it and save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setJson(offer.text);
                setOffer(null);
                setMsg({ tone: "ok", text: "Fixed in the editor. Read it over, then save." });
              }}
              disabled={busy}
            >
              Fix it, let me look first
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOffer(null)} disabled={busy}>
              Leave it, I&apos;ll fix it
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => save()} disabled={busy || !dirty}>
          {busy ? "Saving..." : dirty ? "Save template" : "Saved"}
        </Button>
        <Button size="sm" variant="outline" onClick={check} disabled={busy}>
          Check &amp; tidy
        </Button>
        {loaded?.builtin ? (
          <Button size="sm" variant="ghost" onClick={revert} disabled={busy}>
            Revert to shipped version
          </Button>
        ) : null}
        {dirty ? <span className="text-[11px] text-amber-600">Unsaved changes</span> : null}
      </div>

      {msg ? (
        <p className={msg.tone === "ok" ? "text-xs text-green-700" : "text-xs text-amber-700"}>{msg.text}</p>
      ) : null}
    </div>
  );
}
