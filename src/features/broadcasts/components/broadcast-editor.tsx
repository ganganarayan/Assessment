"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteBroadcast,
  previewAudience,
  saveBroadcast,
  scheduleBroadcast,
  stopBroadcast,
  unscheduleBroadcast,
} from "@/features/broadcasts/actions";
import {
  BROADCAST_PLACEHOLDERS,
  STATUS_CLASS,
  STATUS_LABEL,
  scheduleProblems,
  type BroadcastOptions,
  type BroadcastView,
} from "@/features/broadcasts/types";

/**
 * Writing and scheduling one broadcast.
 *
 * The count is the centre of this screen, not a detail. Everything else is a message
 * somebody is confident about; the number is the part they are about to be wrong
 * about, so it is checked on demand, shown next to the button that commits it, and
 * never guessed at.
 */
export function BroadcastEditor({
  broadcast,
  options,
  basePath,
}: {
  broadcast: BroadcastView;
  options: BroadcastOptions;
  basePath: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [v, setV] = useState(broadcast);
  const [when, setWhen] = useState(broadcast.scheduledAt ? broadcast.scheduledAt.slice(0, 16) : "");

  const locked = v.status === "SENDING" || v.status === "SENT" || v.status === "CANCELLED";
  const problems = scheduleProblems(v);
  const template = options.wabaTemplates.find((t) => t.name === v.wabaTemplate);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "That did not work.");
      else router.refresh();
    });

  const save = () =>
    run(() =>
      saveBroadcast({
        id: v.id,
        name: v.name,
        subject: v.subject,
        body: v.body,
        wabaTemplate: v.wabaTemplate,
        wabaLang: v.wabaLang,
        wabaVars: v.wabaVars,
        audience: v.audience,
        ratePerMinute: v.ratePerMinute,
      }),
    );

  const check = () =>
    start(async () => {
      setMsg(null);
      const r = await previewAudience(v.audience, v.channel);
      if (r.ok && r.data) setCount(r.data.count);
      else if (!r.ok) setMsg(r.error);
    });

  const toggle = (key: "assessmentIds" | "tagIds", id: string) =>
    setV((x) => {
      const on = x.audience[key].includes(id);
      return {
        ...x,
        audience: {
          ...x.audience,
          [key]: on ? x.audience[key].filter((i) => i !== id) : [...x.audience[key], id],
        },
      };
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Input
              value={v.name}
              disabled={locked}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              onBlur={() => !locked && save()}
              className="text-lg font-semibold"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[v.status]}`}>
                {STATUS_LABEL[v.status]}
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {v.channel === "WABA" ? "WhatsApp" : "Email"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {v.status === "SCHEDULED" || v.status === "SENDING" ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => {
                if (!confirm("Stop this broadcast? Messages already sent cannot be recalled.")) return;
                run(() => stopBroadcast(v.id));
              }}>
                Stop
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={pending || v.status === "SENDING"}
              onClick={() => {
                if (!confirm("Delete this broadcast?")) return;
                run(async () => {
                  const r = await deleteBroadcast(v.id);
                  if (r.ok) router.push(basePath);
                  return r;
                });
              }}
            >
              Delete
            </Button>
          </div>
        </div>

        {v.totalCount > 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            {v.sentCount} sent · {v.failedCount} failed · {v.skippedCount} skipped · of {v.totalCount}
            {v.startedAt ? ` · started ${v.startedAt} IST` : ""}
            {v.finishedAt ? ` · finished ${v.finishedAt} IST` : ""}
          </p>
        ) : null}
        {msg ? <p className="text-sm text-red-500">{msg}</p> : null}
      </div>

      {/* Audience */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Who it goes to</p>

        <Group label="Assessments (any of)">
          {options.assessments.length === 0 ? (
            <Muted>No assessments yet.</Muted>
          ) : (
            options.assessments.map((a) => (
              <Chip key={a.id} on={v.audience.assessmentIds.includes(a.id)} disabled={locked} onClick={() => toggle("assessmentIds", a.id)}>
                {a.title}
              </Chip>
            ))
          )}
        </Group>

        <Group label="Tags (must have all)">
          {options.tags.length === 0 ? (
            <Muted>No tags yet. Create them on the Contacts page.</Muted>
          ) : (
            options.tags.map((t) => (
              <Chip key={t.id} on={v.audience.tagIds.includes(t.id)} disabled={locked} onClick={() => toggle("tagIds", t.id)}>
                {t.name}
              </Chip>
            ))
          )}
        </Group>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Bands (comma separated)</span>
            <Input
              value={v.audience.bands.join(", ")}
              disabled={locked}
              placeholder="e.g. HIGH, MEDIUM"
              onChange={(e) =>
                setV({
                  ...v,
                  audience: {
                    ...v.audience,
                    bands: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  },
                })
              }
              onBlur={() => !locked && save()}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Added from</span>
            <Input
              type="date"
              disabled={locked}
              value={v.audience.createdFrom?.slice(0, 10) ?? ""}
              onChange={(e) =>
                setV({ ...v, audience: { ...v.audience, createdFrom: e.target.value || null } })
              }
              onBlur={() => !locked && save()}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Added to</span>
            <Input
              type="date"
              disabled={locked}
              value={v.audience.createdTo?.slice(0, 10) ?? ""}
              onChange={(e) => setV({ ...v, audience: { ...v.audience, createdTo: e.target.value || null } })}
              onBlur={() => !locked && save()}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" disabled={pending} onClick={check}>
            {pending ? "Counting..." : "Count them"}
          </Button>
          {count != null ? (
            <span className="text-sm font-medium">
              {count} {count === 1 ? "person" : "people"} right now
            </span>
          ) : null}
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Anybody unsubscribed is always excluded, and so is anybody with no{" "}
          {v.channel === "WABA" ? "mobile number" : "email address"}. The list is fixed when the
          send starts, not now.
        </p>
      </div>

      {/* Message */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm font-medium">The message</p>
        {v.channel === "EMAIL" ? (
          <>
            <Input
              value={v.subject}
              disabled={locked}
              placeholder="Subject"
              onChange={(e) => setV({ ...v, subject: e.target.value })}
              onBlur={() => !locked && save()}
            />
            <textarea
              value={v.body}
              disabled={locked}
              rows={8}
              onChange={(e) => setV({ ...v, body: e.target.value })}
              onBlur={() => !locked && save()}
              className="w-full rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] p-2 text-sm"
            />
          </>
        ) : (
          <>
            {options.wabaTemplates.length > 0 ? (
              <select
                value={v.wabaTemplate}
                disabled={locked}
                onChange={(e) => setV({ ...v, wabaTemplate: e.target.value })}
                onBlur={() => !locked && save()}
                className="rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] px-2 py-1 text-sm"
              >
                <option value="">Pick a template</option>
                {options.wabaTemplates.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.varCount} variable{t.varCount === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={v.wabaTemplate}
                disabled={locked}
                placeholder="Exact approved template name"
                onChange={(e) => setV({ ...v, wabaTemplate: e.target.value })}
                onBlur={() => !locked && save()}
              />
            )}
            {Array.from({ length: template?.varCount ?? v.wabaVars.length }).map((_, i) => (
              <Input
                key={i}
                value={v.wabaVars[i] ?? ""}
                disabled={locked}
                placeholder={`Variable {{${i + 1}}}`}
                onChange={(e) => {
                  const next = [...v.wabaVars];
                  next[i] = e.target.value;
                  setV({ ...v, wabaVars: next });
                }}
                onBlur={() => !locked && save()}
              />
            ))}
          </>
        )}
        <p className="text-xs text-[var(--muted-foreground)]">
          Placeholders: {BROADCAST_PLACEHOLDERS.map((p) => `{{${p}}}`).join(" · ")}
        </p>
      </div>

      {/* Schedule */}
      {locked ? null : (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">When it goes</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Date and time</span>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">Messages per minute</span>
              <Input
                type="number"
                min={1}
                max={600}
                value={v.ratePerMinute}
                onChange={(e) => setV({ ...v, ratePerMinute: Number(e.target.value) })}
                onBlur={save}
                className="w-28"
              />
            </label>
            {v.status === "SCHEDULED" ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => unscheduleBroadcast(v.id))}>
                Call it off
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={pending || !when || problems.length > 0}
                onClick={() => {
                  const n = count != null ? `${count} people` : "everybody who matches";
                  if (!confirm(`Schedule this to go to ${n}?`)) return;
                  run(() => scheduleBroadcast({ id: v.id, scheduledAt: new Date(when).toISOString() }));
                }}
              >
                Schedule
              </Button>
            )}
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            🟡 The rate is a safety limit, not a speed setting. A burst of blocks costs a WhatsApp
            number its messaging tier, so a large send is meant to take a while.
          </p>
          {problems.length > 0 ? (
            <div className="rounded-md border border-amber-500/60 p-3 text-xs">
              <p className="font-medium">🟡 Not ready to schedule</p>
              <ul className="mt-1 list-inside list-disc text-[var(--muted-foreground)]">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-[var(--muted-foreground)]">{children}</span>;
}

function Chip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-xs ${
        on
          ? "border-emerald-500/60 text-emerald-600 dark:text-emerald-400"
          : "border-[var(--field-border)] text-[var(--muted-foreground)]"
      }`}
    >
      {children}
    </button>
  );
}
