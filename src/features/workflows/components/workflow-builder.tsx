"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addWorkflowStep,
  deleteWorkflow,
  deleteWorkflowStep,
  moveWorkflowStep,
  setWorkflowStatus,
  updateWorkflowSettings,
  updateWorkflowStep,
} from "@/features/workflows/actions";
import {
  DELAY_UNITS,
  STATUS_CLASS,
  STATUS_LABEL,
  TRIGGERS,
  WORKFLOW_PLACEHOLDERS,
  publishProblems,
  type BuilderOptions,
  type WorkflowStepView,
  type WorkflowView,
} from "@/features/workflows/types";

/**
 * The sequence builder: a vertical flow.
 *
 * Not a drag canvas, deliberately. This product is mobile first, and a canvas on a
 * phone is a pinch-zoom argument rather than an interface. A sequence is also a LIST -
 * it has one path, each step follows the one above it - so a column of connected cards
 * is the honest shape of the thing, not a simplification of it. The day steps branch
 * is the day a canvas earns its place.
 *
 * Reordering is buttons rather than drag, for the same reason: drag is the one
 * interaction that has no good touch equivalent and no keyboard equivalent at all.
 */
export function WorkflowBuilder({
  workflow,
  options,
  basePath,
}: {
  workflow: WorkflowView;
  options: BuilderOptions;
  /** "/admin/workflows" or "/w/workflows". */
  basePath: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState(workflow.name);
  const [assessmentId, setAssessmentId] = useState(workflow.assessmentId ?? "");
  const [bandKey, setBandKey] = useState(workflow.bandKey ?? "");
  const [triggerTagId, setTriggerTagId] = useState(workflow.triggerTagId ?? "");

  const spec = TRIGGERS.find((t) => t.value === workflow.trigger);
  const live = workflow.status === "PUBLISHED";
  const problems = publishProblems(workflow);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "That did not work.");
      else router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name !== workflow.name) {
                  run(() =>
                    updateWorkflowSettings({
                      id: workflow.id,
                      name,
                      assessmentId: assessmentId || null,
                      bandKey: bandKey || null,
                      triggerTagId: triggerTagId || null,
                    }),
                  );
                }
              }}
              className="text-lg font-semibold"
            />
            <span className={`w-fit rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[workflow.status]}`}>
              {STATUS_LABEL[workflow.status]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={live ? "outline" : undefined}
              disabled={pending || (!live && problems.length > 0)}
              onClick={() => run(() => setWorkflowStatus(workflow.id, !live))}
            >
              {live ? "Switch off" : "Publish"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const warn =
                  workflow.activeRuns > 0
                    ? `${workflow.activeRuns} ${workflow.activeRuns === 1 ? "person is" : "people are"} partway through this. Deleting it stops them where they are. Continue?`
                    : "Delete this workflow?";
                if (!confirm(warn)) return;
                run(async () => {
                  const r = await deleteWorkflow(workflow.id);
                  if (r.ok) router.push(basePath);
                  return r;
                });
              }}
            >
              Delete
            </Button>
          </div>
        </div>

        <p className="text-xs text-[var(--muted-foreground)]">
          {workflow.activeRuns} partway through · {workflow.doneRuns} finished
        </p>

        {!live && problems.length > 0 ? (
          <div className="rounded-md border border-amber-500/60 p-3 text-xs">
            <p className="font-medium">🟡 Not ready to publish</p>
            <ul className="mt-1 list-inside list-disc text-[var(--muted-foreground)]">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {msg ? <p className="text-sm text-red-500">{msg}</p> : null}
      </div>

      {/* The trigger: the top of the flow */}
      <div className="rounded-lg border-2 border-dashed p-4">
        <p className="text-xs font-medium text-[var(--muted-foreground)]">WHEN</p>
        <p className="mt-1 text-sm font-medium">{spec?.label ?? workflow.trigger}</p>
        <p className="text-xs text-[var(--muted-foreground)]">{spec?.hint}</p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Field label="On which assessment">
            <Select
              value={assessmentId}
              placeholder="Any assessment"
              options={options.assessments.map((a) => ({ value: a.id, label: a.title }))}
              onChange={(v) => {
                setAssessmentId(v);
                run(() =>
                  updateWorkflowSettings({
                    id: workflow.id,
                    name,
                    assessmentId: v || null,
                    bandKey: bandKey || null,
                    triggerTagId: triggerTagId || null,
                  }),
                );
              }}
            />
          </Field>

          {spec?.needsBand ? (
            <Field label="Which band">
              <Input
                value={bandKey}
                placeholder="e.g. HIGH"
                onChange={(e) => setBandKey(e.target.value)}
                onBlur={() =>
                  run(() =>
                    updateWorkflowSettings({
                      id: workflow.id,
                      name,
                      assessmentId: assessmentId || null,
                      bandKey: bandKey || null,
                      triggerTagId: triggerTagId || null,
                    }),
                  )
                }
              />
            </Field>
          ) : null}

          {spec?.needsTag ? (
            <Field label="Which tag">
              <Select
                value={triggerTagId}
                placeholder="Pick a tag"
                options={options.tags.map((t) => ({ value: t.id, label: t.name }))}
                onChange={(v) => {
                  setTriggerTagId(v);
                  run(() =>
                    updateWorkflowSettings({
                      id: workflow.id,
                      name,
                      assessmentId: assessmentId || null,
                      bandKey: bandKey || null,
                      triggerTagId: v || null,
                    }),
                  );
                }}
              />
            </Field>
          ) : null}
        </div>
      </div>

      {/* Steps */}
      {workflow.steps.map((step, i) => (
        <div key={step.id} className="flex flex-col items-stretch gap-0">
          <Connector />
          <StepCard
            step={step}
            index={i}
            total={workflow.steps.length}
            options={options}
            pending={pending}
            onSave={(patch) => run(() => updateWorkflowStep(workflow.id, { ...step, ...patch }))}
            onMove={(d) => run(() => moveWorkflowStep(workflow.id, step.id, d))}
            onDelete={() => {
              if (!confirm("Delete this step?")) return;
              run(() => deleteWorkflowStep(workflow.id, step.id));
            }}
          />
        </div>
      ))}

      <Connector />

      <div className="flex flex-wrap gap-2 rounded-lg border border-dashed p-3">
        <span className="w-full text-xs text-[var(--muted-foreground)]">Add a step</span>
        {(["MESSAGE", "DELAY", "TAG"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => addWorkflowStep(workflow.id, k))}
          >
            {k === "MESSAGE" ? "Message" : k === "DELAY" ? "Wait" : "Tag"}
          </Button>
        ))}
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        Placeholders: {WORKFLOW_PLACEHOLDERS.map((p) => `{{${p}}}`).join(" · ")}
      </p>
    </div>
  );
}

/** The line between two cards. The only thing making this read as a flow. */
function Connector() {
  return <div className="mx-auto h-5 w-px bg-[var(--field-border)]" aria-hidden="true" />;
}

function StepCard({
  step,
  index,
  total,
  options,
  pending,
  onSave,
  onMove,
  onDelete,
}: {
  step: WorkflowStepView;
  index: number;
  total: number;
  options: BuilderOptions;
  pending: boolean;
  onSave: (patch: Partial<WorkflowStepView>) => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [v, setV] = useState(step);
  const set = (patch: Partial<WorkflowStepView>) => setV((x) => ({ ...x, ...patch }));
  const template = options.wabaTemplates.find((t) => t.name === v.wabaTemplate);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-medium text-[var(--muted-foreground)]">
          STEP {index + 1} ·{" "}
          {step.kind === "MESSAGE" ? "MESSAGE" : step.kind === "DELAY" ? "WAIT" : "TAG"}
        </p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={pending || index === 0} onClick={() => onMove(-1)}>
            Up
          </Button>
          <Button size="sm" variant="ghost" disabled={pending || index === total - 1} onClick={() => onMove(1)}>
            Down
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={onDelete}>
            Remove
          </Button>
        </div>
      </div>

      {step.kind === "DELAY" ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Wait">
            <Input
              type="number"
              min={0}
              value={v.delayAmount ?? 0}
              onChange={(e) => set({ delayAmount: Number(e.target.value) })}
              onBlur={() => onSave({ delayAmount: v.delayAmount, delayUnit: v.delayUnit })}
              className="w-24"
            />
          </Field>
          <Field label={" "}>
            <Select
              value={v.delayUnit ?? "DAYS"}
              placeholder=""
              options={DELAY_UNITS.map((u) => ({ value: u.value, label: u.label }))}
              onChange={(u) => {
                const unit = u as WorkflowStepView["delayUnit"];
                set({ delayUnit: unit });
                onSave({ delayAmount: v.delayAmount, delayUnit: unit });
              }}
            />
          </Field>
          <p className="text-xs text-[var(--muted-foreground)]">
            Months are calendar months, so the same date the next month.
          </p>
        </div>
      ) : null}

      {step.kind === "TAG" ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Do">
            <Select
              value={v.tagAction ?? "ADD"}
              placeholder=""
              options={[
                { value: "ADD", label: "Add tag" },
                { value: "REMOVE", label: "Remove tag" },
              ]}
              onChange={(a) => {
                const action = a as WorkflowStepView["tagAction"];
                set({ tagAction: action });
                onSave({ tagAction: action, tagId: v.tagId });
              }}
            />
          </Field>
          <Field label="Tag">
            <Select
              value={v.tagId ?? ""}
              placeholder="Pick a tag"
              options={options.tags.map((t) => ({ value: t.id, label: t.name }))}
              onChange={(id) => {
                set({ tagId: id });
                onSave({ tagId: id, tagAction: v.tagAction });
              }}
            />
          </Field>
          {options.tags.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              No tags yet. Create one on the Contacts page.
            </p>
          ) : null}
        </div>
      ) : null}

      {step.kind === "MESSAGE" ? (
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Send by">
            <Select
              value={v.channel ?? "EMAIL"}
              placeholder=""
              options={[
                { value: "EMAIL", label: "Email" },
                ...(options.wabaAvailable ? [{ value: "WABA", label: "WhatsApp" }] : []),
              ]}
              onChange={(c) => {
                const channel = c as WorkflowStepView["channel"];
                set({ channel });
                onSave({ channel });
              }}
            />
          </Field>

          {(v.channel ?? "EMAIL") === "EMAIL" ? (
            <>
              <Field label="Subject">
                <Input
                  value={v.subject}
                  onChange={(e) => set({ subject: e.target.value })}
                  onBlur={() => onSave({ subject: v.subject })}
                />
              </Field>
              <Field label="Message">
                <textarea
                  value={v.body}
                  onChange={(e) => set({ body: e.target.value })}
                  onBlur={() => onSave({ body: v.body })}
                  rows={6}
                  className="w-full rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] p-2 text-sm"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Approved template">
                {options.wabaTemplates.length > 0 ? (
                  <Select
                    value={v.wabaTemplate}
                    placeholder="Pick a template"
                    options={options.wabaTemplates.map((t) => ({
                      value: t.name,
                      label: `${t.name} (${t.varCount} variable${t.varCount === 1 ? "" : "s"})`,
                    }))}
                    onChange={(nameV) => {
                      set({ wabaTemplate: nameV });
                      onSave({ wabaTemplate: nameV });
                    }}
                  />
                ) : (
                  <Input
                    value={v.wabaTemplate}
                    placeholder="Exact template name from WhatsApp Manager"
                    onChange={(e) => set({ wabaTemplate: e.target.value })}
                    onBlur={() => onSave({ wabaTemplate: v.wabaTemplate })}
                  />
                )}
              </Field>
              <Field label="Language">
                <Input
                  value={v.wabaLang}
                  placeholder="en"
                  onChange={(e) => set({ wabaLang: e.target.value })}
                  onBlur={() => onSave({ wabaLang: v.wabaLang })}
                  className="w-28"
                />
              </Field>
              {/* One box per variable the template actually declares. Guessing the
                  count is how a send gets rejected by Meta for a mismatch. */}
              {Array.from({ length: template?.varCount ?? v.wabaVars.length }).map((_, i) => (
                <Field key={i} label={`Variable {{${i + 1}}}`}>
                  <Input
                    value={v.wabaVars[i] ?? ""}
                    placeholder="Text, or a {{placeholder}}"
                    onChange={(e) => {
                      const next = [...v.wabaVars];
                      next[i] = e.target.value;
                      set({ wabaVars: next });
                    }}
                    onBlur={() => onSave({ wabaVars: v.wabaVars })}
                  />
                </Field>
              ))}
            </>
          )}

          <p className="text-xs text-[var(--muted-foreground)]">
            Sent {step.sentCount} · failed {step.failedCount} · skipped {step.skippedCount}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
    </label>
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
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
