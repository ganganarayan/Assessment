"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createContactField,
  createTag,
  deleteContactField,
  deleteTag,
  setContactDnd,
  setContactFieldHold,
  setContactFieldValue,
  setContactTag,
} from "@/features/contacts/actions";
import { keyFromLabel } from "@/lib/contacts/field-names";
import type { ContactsView } from "@/features/contacts/data";

/**
 * The contacts list.
 *
 * Mobile first, so the rows are cards that become a table at sm and up rather than a
 * table that scrolls sideways on a phone. The filters are the same three a broadcast
 * audience will offer, which is deliberate: the list you can see is the list you can
 * message, and nobody should have to guess whether the two agree.
 */
export function ContactsScreen({
  view,
  filters,
  basePath,
}: {
  view: ContactsView;
  filters: { q: string; tagId: string; assessmentId: string; dnd: string };
  /** "/admin/contacts" or "/w/contacts" - the same screen on both rails. */
  basePath: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [newField, setNewField] = useState("");

  const go = (next: Partial<typeof filters> & { page?: number }) => {
    const p = new URLSearchParams();
    const merged = { ...filters, q, ...next };
    if (merged.q) p.set("q", merged.q);
    if (merged.tagId) p.set("tag", merged.tagId);
    if (merged.assessmentId) p.set("assessment", merged.assessmentId);
    if (merged.dnd) p.set("dnd", merged.dnd);
    if (next.page && next.page > 1) p.set("page", String(next.page));
    router.push(`${basePath}${p.toString() ? `?${p}` : ""}`);
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "That did not work.");
      else router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={q}
            placeholder="Name, email or mobile"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go({});
            }}
          />
          <Button size="sm" onClick={() => go({})} disabled={pending}>
            Search
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={filters.assessmentId}
            onChange={(v) => go({ assessmentId: v, page: 1 })}
            placeholder="Any assessment"
            options={view.assessments.map((a) => ({ value: a.id, label: a.title }))}
          />
          <Select
            value={filters.tagId}
            onChange={(v) => go({ tagId: v, page: 1 })}
            placeholder="Any tag"
            options={view.tags.map((t) => ({ value: t.id, label: `${t.name} (${t.count})` }))}
          />
          <Select
            value={filters.dnd}
            onChange={(v) => go({ dnd: v, page: 1 })}
            placeholder="Everyone"
            options={[
              { value: "in", label: "Can be messaged" },
              { value: "out", label: "Unsubscribed" },
            ]}
          />
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          {view.total} contact{view.total === 1 ? "" : "s"} match.
        </p>
      </div>

      {/* Tags */}
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">Tags</p>
        <div className="flex flex-wrap items-center gap-2">
          {view.tags.length === 0 ? (
            <span className="text-xs text-[var(--muted-foreground)]">None yet.</span>
          ) : (
            view.tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
              >
                {t.name}
                <span className="text-[var(--muted-foreground)]">{t.count}</span>
                <button
                  type="button"
                  aria-label={`Delete tag ${t.name}`}
                  className="ml-1 text-[var(--muted-foreground)] hover:text-red-500"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Delete the tag "${t.name}"? The contacts stay, the label goes.`)) return;
                    run(() => deleteTag(t.id));
                  }}
                >
                  x
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={newTag}
            placeholder="New tag name"
            onChange={(e) => setNewTag(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !newTag.trim()}
            onClick={() =>
              run(async () => {
                const r = await createTag(newTag);
                if (r.ok) setNewTag("");
                return r;
              })
            }
          >
            Add
          </Button>
        </div>
      </div>

      {/* Custom values. The registry, not the values: this is where a workspace says
          what it keeps about a person, and the boxes to fill them in are on each row. */}
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">Custom values</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Anything else you keep about a person, written into a message as a placeholder.
        </p>
        <div className="flex flex-col gap-2">
          {view.fields.length === 0 ? (
            <span className="text-xs text-[var(--muted-foreground)]">None yet.</span>
          ) : (
            view.fields.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1">
                <span className="text-xs font-medium">{f.label}</span>
                <code className="rounded bg-[var(--muted)] px-1 text-xs">{`{{${f.key}}}`}</code>
                {f.system ? (
                  <span
                    className="rounded-full border border-dashed px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]"
                    title="Filled in by the app itself, so it cannot be renamed or removed."
                  >
                    automatic
                  </span>
                ) : null}
                {/* 🔴 The decision that keeps a half-finished message off a customer's
                    screen. Phrased as what it does, not as "required". */}
                <label className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                  <input
                    type="checkbox"
                    checked={f.holdWhenEmpty}
                    disabled={pending}
                    onChange={(e) => run(() => setContactFieldHold(f.id, e.target.checked))}
                  />
                  Hold the message if empty
                </label>
                {f.system ? null : (
                  <button
                    type="button"
                    aria-label={`Delete custom value ${f.label}`}
                    className="ml-auto text-xs text-[var(--muted-foreground)] hover:text-red-500"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !confirm(
                          `Stop keeping "${f.label}"? Every value anybody has for it goes too, and messages using ${`{{${f.key}}}`} will show the placeholder.`,
                        )
                      )
                        return;
                      run(() => deleteContactField(f.id));
                    }}
                  >
                    x
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <Input
              value={newField}
              placeholder="e.g. Plan name"
              onChange={(e) => setNewField(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !newField.trim()}
              onClick={() =>
                run(async () => {
                  const r = await createContactField(newField);
                  if (r.ok) setNewField("");
                  return r;
                })
              }
            >
              Add
            </Button>
          </div>
          {/* The placeholder is shown BEFORE it is created, because the name somebody
              types is not the name they will write in a message, and finding that out
              afterwards means renaming it in every message they have already written. */}
          {newField.trim() ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Messages will use <code className="rounded bg-[var(--muted)] px-1">{`{{${keyFromLabel(newField)}}}`}</code>
            </p>
          ) : null}
        </div>
      </div>

      {msg ? <p className="text-sm text-red-500">{msg}</p> : null}

      {/* Rows */}
      <div className="flex flex-col gap-2">
        {view.rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-[var(--muted-foreground)]">
            No contacts yet. They appear here the moment somebody opts in to a funnel.
          </p>
        ) : (
          view.rows.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">
                    {[c.email, c.mobile].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Added {c.createdAt} IST · {c.submissionCount} submission
                    {c.submissionCount === 1 ? "" : "s"}
                    {c.consented ? " · consented" : ""}
                    {c.lastMessageAt ? ` · last message ${c.lastMessageAt} IST` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {c.imported ? (
                    <span
                      className="rounded-full border border-dashed px-2 py-0.5 text-xs text-[var(--muted-foreground)]"
                      title={c.sourceLabel + ". Not opted in, so broadcasts skip them unless you say otherwise."}
                    >
                      {c.sourceLabel}
                    </span>
                  ) : null}
                  {c.optedOut ? (
                    <span className="rounded-full border border-amber-500/60 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                      Unsubscribed{c.optOutSource ? ` (${c.optOutSource.toLowerCase()})` : ""}
                    </span>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      if (!c.optedOut && !confirm(`Stop all marketing to ${c.name}?`)) return;
                      if (
                        c.optedOut &&
                        !confirm(
                          "They asked to be left alone. Only turn this back on if they have asked you to. Continue?",
                        )
                      )
                        return;
                      run(() => setContactDnd(c.id, !c.optedOut));
                    }}
                  >
                    {c.optedOut ? "Resubscribe" : "Unsubscribe"}
                  </Button>
                </div>
              </div>

              {view.fields.length > 0 ? (
                <ContactValues
                  contactId={c.id}
                  fields={view.fields}
                  values={c.values}
                  pending={pending}
                  onSave={(key, value) => run(() => setContactFieldValue(c.id, key, value))}
                />
              ) : null}

              {view.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {view.tags.map((t) => {
                    const on = c.tags.some((x) => x.id === t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => setContactTag(c.id, t.id, !on))}
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          on
                            ? "border-emerald-500/60 text-emerald-600 dark:text-emerald-400"
                            : "border-[var(--field-border)] text-[var(--muted-foreground)]"
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {view.pages > 1 ? (
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            disabled={view.page <= 1 || pending}
            onClick={() => go({ page: view.page - 1 })}
          >
            Previous
          </Button>
          <span className="text-xs text-[var(--muted-foreground)]">
            Page {view.page} of {view.pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={view.page >= view.pages || pending}
            onClick={() => go({ page: view.page + 1 })}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] px-2 py-1 text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * One person's custom values, collapsed until somebody asks.
 *
 * Collapsed because a list of contacts is read far more often than it is edited, and
 * four boxes per row would bury the thing the page is for. Open, it shows every field
 * the workspace keeps rather than only the filled-in ones: an empty value is the one
 * somebody came here to type.
 */
function ContactValues({
  contactId,
  fields,
  values,
  pending,
  onSave,
}: {
  contactId: string;
  fields: { id: string; key: string; label: string; holdWhenEmpty: boolean; system: boolean }[];
  values: Record<string, string>;
  pending: boolean;
  onSave: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const filled = fields.filter((f) => (values[f.key] ?? "").trim()).length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit text-xs text-[var(--muted-foreground)] underline"
      >
        Values ({filled} of {fields.length})
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-2">
      {fields.map((f) => (
        <ValueBox
          key={`${contactId}:${f.id}`}
          label={f.label}
          holdWhenEmpty={f.holdWhenEmpty}
          initial={values[f.key] ?? ""}
          pending={pending}
          onSave={(v) => onSave(f.key, v)}
        />
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="w-fit text-xs text-[var(--muted-foreground)] underline"
      >
        Hide
      </button>
    </div>
  );
}

/** One box, saved on blur, so nothing is lost and nothing is written per keystroke. */
function ValueBox({
  label,
  holdWhenEmpty,
  initial,
  pending,
  onSave,
}: {
  label: string;
  holdWhenEmpty: boolean;
  initial: string;
  pending: boolean;
  onSave: (value: string) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <span className="min-w-32 text-xs text-[var(--muted-foreground)]">{label}</span>
      <Input
        value={v}
        disabled={pending}
        placeholder={holdWhenEmpty ? "Empty holds any message that uses it" : "Optional"}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v !== initial) onSave(v);
        }}
      />
    </label>
  );
}
