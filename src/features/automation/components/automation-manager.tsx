"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { NURTURE_PLACEHOLDERS } from "@/features/nurture/config";
import { fetchWabaTemplates, type WabaTemplateOption } from "@/features/nurture/actions";
import {
  APPOINTMENT_PLACEHOLDERS,
  OFFSET_PRESETS,
  RUN_STATUS_CLASS,
  RUN_STATUS_LABEL,
  TRIGGERS,
  TRIGGER_LABEL,
  offsetLabel,
  type AutomationChannelValue,
  type AutomationRow,
  type AutomationRunRow,
  type AutomationTriggerValue,
} from "@/features/automation/types";
import {
  deleteAutomation,
  saveAutomation,
  sendAutomationTest,
  setAutomationActive,
} from "@/features/automation/actions";

/**
 * The automation builder: when THIS happens, send THESE.
 *
 * One screen, because the two halves only make sense together - a rule with no message
 * sends nothing and a message with no trigger never fires - and a run log underneath,
 * because the only honest answer to "is my reminder working" is what it has actually
 * sent.
 */

interface ActionDraft {
  channel: AutomationChannelValue;
  subject: string;
  body: string;
  wabaTemplate: string;
  wabaLang: string;
  wabaVars: string[];
}

interface Draft {
  name: string;
  trigger: AutomationTriggerValue;
  bookingTypeId: string;
  offsetMin: number;
  active: boolean;
  actions: ActionDraft[];
}

const BLANK_EMAIL: ActionDraft = {
  channel: "EMAIL",
  subject: "",
  body: "",
  wabaTemplate: "",
  wabaLang: "en",
  wabaVars: [],
};
const BLANK_WABA: ActionDraft = { ...BLANK_EMAIL, channel: "WABA" };

const BLANK: Draft = {
  name: "",
  trigger: "APPOINTMENT_BOOKED",
  bookingTypeId: "",
  offsetMin: -1440,
  active: true,
  actions: [{ ...BLANK_EMAIL }],
};

const draftOf = (a: AutomationRow): Draft => ({
  name: a.name,
  trigger: a.trigger,
  bookingTypeId: a.bookingTypeId ?? "",
  offsetMin: a.offsetMin || -1440,
  active: a.active,
  actions: a.actions.map((x) => ({
    channel: x.channel,
    subject: x.subject,
    body: x.body,
    wabaTemplate: x.wabaTemplate,
    wabaLang: x.wabaLang,
    wabaVars: x.wabaVars,
  })),
});

export function AutomationManager({
  automations,
  runs,
  bookingTypes,
  showWaba,
  canEdit,
}: {
  automations: AutomationRow[];
  runs: AutomationRunRow[];
  bookingTypes: { id: string; label: string }[];
  /** False while WhatsApp is parked for this workspace: the channel is not offered. */
  showWaba: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, close = true) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r.ok) {
        setMsg(done);
        if (close) {
          setCreating(false);
          setEditingId(null);
        }
        router.refresh();
      } else {
        setMsg(r.error ?? "That did not work.");
      }
    });

  return (
    <div className="flex flex-col gap-6">
      {msg ? (
        <p className="rounded-md bg-[var(--muted)]/40 px-3 py-2 text-sm text-[var(--muted-foreground)]">{msg}</p>
      ) : null}

      {bookingTypes.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-[var(--muted-foreground)]">
          Nothing can be booked yet, so nothing can trigger. Create a booking link under Calendar →
          Availability first.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Your automations</h2>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setCreating((v) => !v)}>
            {creating ? "Close" : "New automation"}
          </Button>
        ) : null}
      </div>

      {creating ? (
        <AutomationForm
          initial={BLANK}
          bookingTypes={bookingTypes}
          showWaba={showWaba}
          pending={pending}
          onSubmit={(d) => run(() => saveAutomation(d), "Automation created.")}
        />
      ) : null}

      {automations.length === 0 && !creating ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-[var(--muted-foreground)]">
          No automations yet. The two worth having first: a confirmation when a call is booked, and a
          reminder a day before it.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {automations.map((a) => (
          <article key={a.id} className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">
                  {a.name}{" "}
                  <span className="font-normal text-[var(--muted-foreground)]">
                    · {TRIGGER_LABEL[a.trigger]}
                    {a.trigger === "APPOINTMENT_REMINDER" ? `, ${offsetLabel(a.offsetMin)}` : ""}
                  </span>
                </h3>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {a.bookingTypeName ?? "Every booking link"} ·{" "}
                  {a.actions.map((x) => (x.channel === "EMAIL" ? "Email" : "WhatsApp")).join(" + ") ||
                    "no messages"}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {a.sentCount} sent
                  {a.pendingCount > 0 ? ` · ${a.pendingCount} waiting` : ""}
                  {a.failedCount > 0 ? ` · ${a.failedCount} failed` : ""}
                  {!a.active ? " · switched off" : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => setAutomationActive(a.id, !a.active),
                        a.active ? "Switched off." : "Switched on.",
                        false,
                      )
                    }
                  >
                    {a.active ? "Switch off" : "Switch on"}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId((cur) => (cur === a.id ? null : a.id))}
                >
                  {editingId === a.id ? "Close" : "Edit"}
                </Button>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => deleteAutomation(a.id), "Automation deleted.")}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>

            {editingId === a.id ? (
              <>
                <AutomationForm
                  initial={draftOf(a)}
                  bookingTypes={bookingTypes}
                  showWaba={showWaba}
                  pending={pending}
                  onSubmit={(d) => run(() => saveAutomation(d, a.id), "Automation saved.")}
                />
                {canEdit && a.actions.some((x) => x.channel === "EMAIL") ? (
                  <TestSend
                    pending={pending}
                    onSend={(to) =>
                      run(() => sendAutomationTest(a.id, to), "Test email sent.", false)
                    }
                  />
                ) : null}
              </>
            ) : null}
          </article>
        ))}
      </div>

      {/* What the rules have actually done. */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Recent sends</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nothing has fired yet. A run appears here the moment a booking triggers one.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-[var(--muted)]/30 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Due</th>
                  <th className="px-3 py-2 text-left font-medium">Automation</th>
                  <th className="px-3 py-2 text-left font-medium">Who</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{r.dueLabel}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-medium">{r.automationName}</span>
                      <br />
                      <span className="text-xs text-[var(--muted-foreground)]">{r.appointmentLabel}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.who}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-block rounded-full border px-2 py-0.5 text-xs font-medium",
                          RUN_STATUS_CLASS[r.status],
                        )}
                      >
                        {RUN_STATUS_LABEL[r.status]}
                      </span>
                      {r.skipReason ? (
                        <div className="mt-1 text-xs text-[var(--muted-foreground)]">{r.skipReason}</div>
                      ) : null}
                      {r.lastError ? (
                        <div className="mt-1 text-xs text-red-600 dark:text-red-400">{r.lastError}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------- form --- */

function AutomationForm({
  initial,
  bookingTypes,
  showWaba,
  pending,
  onSubmit,
}: {
  initial: Draft;
  bookingTypes: { id: string; label: string }[];
  showWaba: boolean;
  pending: boolean;
  onSubmit: (draft: Draft) => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));
  const setAction = (i: number, patch: Partial<ActionDraft>) =>
    setD((cur) => ({
      ...cur,
      actions: cur.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    }));

  const spec = TRIGGERS.find((t) => t.value === d.trigger);
  const custom = !OFFSET_PRESETS.some((p) => p.value === d.offsetMin);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Name it, for you</Label>
          <Input
            value={d.name}
            placeholder="Call reminder, a day before"
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">For which booking link</Label>
          <select
            className="h-9 rounded-md border bg-[var(--background)] px-2 text-sm text-[var(--foreground)]"
            value={d.bookingTypeId}
            onChange={(e) => set({ bookingTypeId: e.target.value })}
          >
            <option value="">Every booking link</option>
            {bookingTypes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Trigger */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs">When this happens</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRIGGERS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => set({ trigger: t.value })}
              className={cn(
                "rounded-md border p-2 text-left",
                d.trigger === t.value ? "border-green-600 bg-green-600/10" : "hover:bg-[var(--muted)]",
              )}
            >
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="block text-xs text-[var(--muted-foreground)]">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {spec?.timed ? (
        <div className="flex flex-col gap-2">
          <Label className="text-xs">Send it</Label>
          <div className="flex flex-wrap gap-2">
            {OFFSET_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => set({ offsetMin: p.value })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  d.offsetMin === p.value ? "border-green-600 bg-green-600/10" : "hover:bg-[var(--muted)]",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Or exactly</Label>
            <Input
              type="number"
              className="h-8 w-28 text-xs"
              value={d.offsetMin}
              onChange={(e) => set({ offsetMin: Number(e.target.value) })}
            />
            <span className="text-xs text-[var(--muted-foreground)]">
              minutes ({offsetLabel(d.offsetMin)}){custom ? "" : ""}
            </span>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            Negative is before the call, positive is after. A call booked after the reminder time has
            passed simply does not get that one.
          </p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-xs">Send this</Label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => set({ actions: [...d.actions, { ...BLANK_EMAIL }] })}
            >
              Add an email
            </Button>
            {showWaba ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => set({ actions: [...d.actions, { ...BLANK_WABA }] })}
              >
                Add a WhatsApp
              </Button>
            ) : null}
          </div>
        </div>

        <p className="rounded-md bg-[var(--muted)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
          Placeholders: {[...NURTURE_PLACEHOLDERS, ...APPOINTMENT_PLACEHOLDERS].map((p) => `{{${p}}}`).join("  ")}
          . <strong>{"{{bookingUrl}}"}</strong> is their booking page with their own details already
          filled in, which is what you want in a &ldquo;pick another time&rdquo; message.
        </p>

        {d.actions.map((a, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {a.channel === "EMAIL" ? "Email" : "WhatsApp"}
              </span>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => set({ actions: d.actions.filter((_, idx) => idx !== i) })}
              >
                Remove
              </button>
            </div>

            {a.channel === "EMAIL" ? (
              <>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Subject</Label>
                  <Input
                    value={a.subject}
                    placeholder="Your call is tomorrow, {{firstName}}"
                    onChange={(e) => setAction(i, { subject: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Body (HTML allowed)</Label>
                  <Textarea
                    rows={6}
                    spellCheck={false}
                    value={a.body}
                    placeholder={
                      "<p>Hi {{firstName}},</p>\n<p>Your {{bookingName}} is on {{appointmentDate}} at {{appointmentTime}} IST.</p>\n<p><a href=\"{{meetingLink}}\">Join here</a> · <a href=\"{{icsUrl}}\">Add to calendar</a></p>"
                    }
                    onChange={(e) => setAction(i, { body: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <WabaAction action={a} onChange={(patch) => setAction(i, patch)} />
            )}
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} />
        Switched on
      </label>

      <div>
        <Button size="sm" disabled={pending} onClick={() => onSubmit(d)}>
          {pending ? "Saving…" : "Save automation"}
        </Button>
      </div>
    </div>
  );
}

/** The WhatsApp half: pick an approved template and map its numbered variables. */
function WabaAction({
  action,
  onChange,
}: {
  action: ActionDraft;
  onChange: (patch: Partial<ActionDraft>) => void;
}) {
  const [templates, setTemplates] = useState<WabaTemplateOption[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = () =>
    start(async () => {
      setNote(null);
      const r = await fetchWabaTemplates();
      if (!r.ok) {
        setTemplates(null);
        setNote(r.error);
        return;
      }
      const data = r.data ?? [];
      setTemplates(data);
      setNote(data.length ? `Loaded ${data.length} approved template(s).` : "No approved templates found.");
    });

  const pick = (name: string) => {
    const t = templates?.find((x) => x.name === name);
    if (!t) return;
    onChange({
      wabaTemplate: t.name,
      wabaLang: t.language || action.wabaLang,
      wabaVars: Array.from({ length: t.varCount }, (_, i) => action.wabaVars[i] ?? ""),
    });
  };
  const selected = templates?.find((x) => x.name === action.wabaTemplate) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[var(--muted-foreground)]">
        WhatsApp business-initiated messages must use a template Meta has already approved, so the
        wording comes from your WhatsApp account rather than from here. Map its numbered slots below.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={load} disabled={pending}>
          {pending ? "Loading…" : "Load approved templates"}
        </Button>
        {templates && templates.length > 0 ? (
          <select
            className="h-9 rounded-md border bg-[var(--background)] px-2 text-sm text-[var(--foreground)] sm:w-72"
            value={action.wabaTemplate}
            onChange={(e) => pick(e.target.value)}
            aria-label="Approved template"
          >
            <option value="">Select a template…</option>
            {templates.map((t) => (
              <option key={`${t.name}:${t.language}`} value={t.name}>
                {t.name} ({t.language}) · {t.varCount} var{t.varCount === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {note ? <p className="text-xs text-[var(--muted-foreground)]">{note}</p> : null}
      {selected ? (
        <p className="rounded-md bg-[var(--muted)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
          {selected.bodyText}
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Template name</Label>
          <Input
            value={action.wabaTemplate}
            onChange={(e) => onChange({ wabaTemplate: e.target.value })}
            placeholder="appointment_reminder"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Language</Label>
          <Input value={action.wabaLang} onChange={(e) => onChange({ wabaLang: e.target.value })} />
        </div>
      </div>

      {action.wabaVars.map((v, i) => (
        <div key={i} className="flex flex-col gap-1">
          <Label className="text-xs">{`Variable {{${i + 1}}}`}</Label>
          <Input
            value={v}
            placeholder={i === 0 ? "{{firstName}}" : "{{appointmentTime}}"}
            onChange={(e) =>
              onChange({ wabaVars: action.wabaVars.map((x, idx) => (idx === i ? e.target.value : x)) })
            }
          />
        </div>
      ))}
      <button
        type="button"
        className="self-start text-xs underline"
        onClick={() => onChange({ wabaVars: [...action.wabaVars, ""] })}
      >
        Add a variable
      </button>
    </div>
  );
}

function TestSend({ pending, onSend }: { pending: boolean; onSend: (to: string) => void }) {
  const [to, setTo] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Send yourself what this says</Label>
        <Input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="you@example.com"
          className="sm:w-72"
        />
      </div>
      <Button size="sm" variant="outline" disabled={pending || !to} onClick={() => onSend(to)}>
        Send test email
      </Button>
      <p className="w-full text-xs text-[var(--muted-foreground)]">
        Email only. A WhatsApp template is approved copy held by Meta, so what arrives is decided
        there; the picker above already shows its text.
      </p>
    </div>
  );
}
