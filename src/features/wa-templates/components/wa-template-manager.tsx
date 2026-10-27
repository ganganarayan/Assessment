"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  MAX_BODY,
  STATUS_CLASS,
  STATUS_LABEL,
  normaliseName,
  previewWith,
  templateIssues,
  variableCount,
  type TemplateDraft,
  type WaTemplateCategoryValue,
  type WaTemplateRow,
} from "@/features/wa-templates/types";
import {
  saveWaTemplate,
  deleteWaTemplate,
  submitWaTemplate,
  syncWaTemplates,
} from "@/features/wa-templates/actions";

/**
 * The template builder.
 *
 * 🔴 THE POINT OF THE SCREEN IS THE ISSUES LIST, not the form. Meta queues a bad
 * template, reviews it hours later, and rejects it with a sentence that does not say
 * which rule was broken. Every rule that can be checked without Meta is checked here
 * while the owner types, and Submit stays disabled until the list is empty. That is the
 * difference between a correction that costs a minute and one that costs a day.
 */

const BLANK: TemplateDraft = {
  name: "",
  language: "en",
  category: "UTILITY",
  headerText: "",
  bodyText: "",
  footerText: "",
  sampleValues: [],
};

function toDraft(r: WaTemplateRow): TemplateDraft {
  return {
    name: r.name,
    language: r.language,
    category: r.category,
    headerText: r.headerText,
    bodyText: r.bodyText,
    footerText: r.footerText,
    sampleValues: r.sampleValues,
  };
}

export function WaTemplateManager({
  templates,
  hasBusinessAccountId,
  hasToken,
  canEdit,
}: {
  templates: WaTemplateRow[];
  hasBusinessAccountId: boolean;
  hasToken: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const canReachMeta = hasBusinessAccountId && hasToken;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? done : (r.error ?? "That did not work."));
      if (r.ok) {
        setEditingId(null);
        setCreating(false);
        setConfirmId(null);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp templates</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            WhatsApp will not let a business message somebody first unless the wording was
            approved beforehand. Write it here, check it, and send it to Meta for review.
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && canReachMeta ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(syncWaTemplates, "Refreshed from Meta.")}
            >
              Refresh from Meta
            </Button>
          ) : null}
          {canEdit ? (
            <Button size="sm" onClick={() => { setCreating((v) => !v); setEditingId(null); }}>
              {creating ? "Close" : "New template"}
            </Button>
          ) : null}
        </div>
      </div>

      {msg ? (
        <p className="rounded-md bg-[var(--muted)]/40 px-3 py-2 text-sm text-[var(--muted-foreground)]">{msg}</p>
      ) : null}

      {!canReachMeta ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-[var(--muted-foreground)]">
          {!hasBusinessAccountId && !hasToken
            ? "Drafting works now. Submitting needs your WhatsApp Business Account ID and access token, both in Settings → WhatsApp."
            : !hasBusinessAccountId
              ? "Drafting works now. Submitting needs your WhatsApp Business Account ID, in Settings → WhatsApp."
              : "Drafting works now. Submitting needs your WhatsApp access token, in Settings → WhatsApp."}
        </p>
      ) : null}

      {creating ? (
        <TemplateForm
          initial={BLANK}
          frozen={false}
          pending={pending}
          onCancel={() => setCreating(false)}
          onSubmit={(v) => run(() => saveWaTemplate(v), "Draft saved.")}
        />
      ) : null}

      {templates.length === 0 && !creating ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-[var(--muted-foreground)]">
          No templates yet. The two worth having first: a booking confirmation and a reminder the
          day before. Both are Utility, which is the cheaper category and the one Meta approves
          most readily.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {templates.map((t) => (
          <article key={t.id} className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">{t.language}</span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      STATUS_CLASS[t.status],
                    )}
                  >
                    {STATUS_LABEL[t.status]}
                  </span>
                  <span className="rounded-full border border-[var(--field-border)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">
                    {CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-[var(--muted-foreground)]">
                  {previewWith(t.bodyText, t.sampleValues)}
                </p>
                {t.rejectedReason ? (
                  <p className="text-xs text-red-600 dark:text-red-400">Meta said: {t.rejectedReason}</p>
                ) : null}
                {t.submittedLabel ? (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Sent for review {t.submittedLabel}
                    {t.syncedLabel ? ` · checked ${t.syncedLabel}` : ""}
                  </p>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditingId((c) => (c === t.id ? null : t.id)); setCreating(false); }}
                  >
                    {editingId === t.id ? "Close" : "Edit"}
                  </Button>
                  {t.status === "DRAFT" || t.status === "REJECTED" ? (
                    <Button
                      size="sm"
                      disabled={pending || !canReachMeta}
                      onClick={() => run(() => submitWaTemplate(t.id), "Sent to Meta. Review usually takes minutes, sometimes a day.")}
                    >
                      Submit to Meta
                    </Button>
                  ) : null}
                  {confirmId === t.id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => deleteWaTemplate(t.id), "Removed from this list.")}
                    >
                      Really remove
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(t.id)}>
                      Remove
                    </Button>
                  )}
                </div>
              ) : null}
            </div>

            {confirmId === t.id && t.submitted ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-xs text-[var(--muted-foreground)]">
                This removes it from this list only. Meta keeps its own copy, and an approved
                template goes on sending until you delete it in Meta Business Manager too.
              </p>
            ) : null}

            {editingId === t.id ? (
              <TemplateForm
                initial={toDraft(t)}
                // Name and language are Meta's key. Once Meta has the template, changing
                // either here would submit a second one and leave this row watching the
                // first, so the fields are locked rather than silently misleading.
                frozen={t.submitted}
                pending={pending}
                onCancel={() => setEditingId(null)}
                onSubmit={(v) => run(() => saveWaTemplate(v, t.id), "Saved.")}
              />
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function TemplateForm({
  initial,
  frozen,
  pending,
  onCancel,
  onSubmit,
}: {
  initial: TemplateDraft;
  frozen: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (v: TemplateDraft) => void;
}) {
  const [v, setV] = useState<TemplateDraft>(initial);
  const set = (patch: Partial<TemplateDraft>) => setV((c) => ({ ...c, ...patch }));

  const count = variableCount(v.bodyText);
  const issues = templateIssues(v);
  const category = CATEGORIES.find((c) => c.value === v.category);

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={v.name}
            disabled={frozen}
            placeholder="booking_confirmation"
            // Normalised on blur rather than on every keystroke: rewriting as somebody
            // types an underscore fights the cursor.
            onChange={(e) => set({ name: e.target.value })}
            onBlur={(e) => set({ name: normaliseName(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Language</Label>
          <Input
            value={v.language}
            disabled={frozen}
            placeholder="en"
            onChange={(e) => set({ language: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Category</Label>
          <select
            value={v.category}
            onChange={(e) => set({ category: e.target.value as WaTemplateCategoryValue })}
            className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] px-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {category ? <p className="text-xs text-[var(--muted-foreground)]">{category.hint}</p> : null}

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Header (optional)</Label>
        <Input
          value={v.headerText}
          placeholder="Your call is confirmed"
          onChange={(e) => set({ headerText: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Body</Label>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {v.bodyText.length}/{MAX_BODY}
          </span>
        </div>
        <Textarea
          rows={5}
          value={v.bodyText}
          placeholder={"Hi {{1}}, your call is booked for {{2}}. See you then."}
          onChange={(e) => set({ bodyText: e.target.value })}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Variables are numbered: {"{{1}}"}, {"{{2}}"}. They are filled in when the message is sent,
          and what fills them is chosen on the automation, not here.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Footer (optional)</Label>
        <Input
          value={v.footerText}
          placeholder="Reply STOP to opt out"
          onChange={(e) => set({ footerText: e.target.value })}
        />
      </div>

      {count > 0 ? (
        <div className="flex flex-col gap-2">
          <Label className="text-xs">Example values</Label>
          <p className="text-xs text-[var(--muted-foreground)]">
            Meta reviews the message with these in it, and rejects a template that has none. Use
            something realistic.
          </p>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-12 shrink-0 font-mono text-xs text-[var(--muted-foreground)]">
                {`{{${i + 1}}}`}
              </span>
              <Input
                value={v.sampleValues[i] ?? ""}
                placeholder={i === 0 ? "Ravi" : "Tuesday at 3 pm"}
                onChange={(e) =>
                  set({
                    sampleValues: Array.from({ length: count }, (_, idx) =>
                      idx === i ? e.target.value : (v.sampleValues[idx] ?? ""),
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      ) : null}

      {v.bodyText.trim() ? (
        <div className="flex flex-col gap-1 rounded-md bg-[var(--muted)]/40 px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            How it will read
          </span>
          {v.headerText.trim() ? <p className="text-sm font-semibold">{v.headerText}</p> : null}
          <p className="whitespace-pre-wrap text-sm">{previewWith(v.bodyText, v.sampleValues)}</p>
          {v.footerText.trim() ? (
            <p className="text-xs text-[var(--muted-foreground)]">{v.footerText}</p>
          ) : null}
        </div>
      ) : null}

      {issues.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 rounded-md border border-amber-500/40 px-5 py-2 text-xs text-amber-600 dark:text-amber-400">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Nothing here breaks a Meta rule we can check. Save it, then submit.
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={pending || issues.length > 0} onClick={() => onSubmit(v)}>
          Save draft
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
