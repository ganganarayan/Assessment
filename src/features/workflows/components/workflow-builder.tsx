"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  OFFERED_STEP_KINDS,
  STEP_KIND_LABEL,
  type OfferedStepKind,
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

  // Which box the right-hand panel is describing. The trigger is selected by default,
  // because it is the one node that always exists and the one a new workflow needs
  // filled in first.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Derived rather than held: a step deleted or reordered under us must not leave the
  // panel editing a row that is no longer there.
  const selected = workflow.steps.find((x) => x.id === selectedId) ?? null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "That did not work.");
      else router.refresh();
    });

  /** Run an action that MAKES a step, and select the box it made. */
  const runAndSelect = (fn: () => Promise<{ ok: boolean; error?: string; data?: { id: string } }>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) {
        setMsg(r.error ?? "That did not work.");
        return;
      }
      if (r.data?.id) setSelectedId(r.data.id);
      router.refresh();
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

      {/* The sequence on the left, whatever is selected on the right. On a phone the
          grid collapses and the panel falls underneath the box it describes, which is
          the only honest thing a column of boxes can do at that width. */}
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_21rem] md:items-start md:gap-6">
      <div className="flex flex-col gap-0">

      {/* The start node. Solid and coloured rather than dashed: it is the one box on
          the screen that is not optional, and a dashed border reads as a placeholder. */}
      <div className="rounded-lg border-2 border-emerald-500/50 bg-emerald-500/5 p-4">
        <span className="rounded-full border border-emerald-500/50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
          START
        </span>
        <p className="mt-2 text-sm font-medium">When {(spec?.label ?? workflow.trigger).toLowerCase()}</p>
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

      {/* Every gap has a + in it, so a step goes where it is needed rather than onto
          the end and then walked up with Up four times. */}
      {workflow.steps.map((step, i) => (
        <div key={step.id} className="flex flex-col items-stretch gap-0">
          <Connector />
          <Inserter pending={pending} onAdd={(k) => runAndSelect(() => addWorkflowStep(workflow.id, k, i))} />
          <Connector />
          <StepNode
            step={step}
            index={i}
            options={options}
            selected={selectedId === step.id}
            onSelect={() => setSelectedId(step.id)}
          />
        </div>
      ))}

      <Connector />
      <Inserter
        pending={pending}
        onAdd={(k) => runAndSelect(() => addWorkflowStep(workflow.id, k, workflow.steps.length))}
      />
      <Connector />
      <EndNode />
      </div>

      {/* The properties panel. Sticky on a wide screen so it stays beside the box it
          describes while the sequence scrolls past it. */}
      <aside className="mt-5 flex flex-col gap-3 md:sticky md:top-4 md:mt-0">
        {selected ? (
          <StepCard
            key={selected.id}
            step={selected}
            workflowId={workflow.id}
            index={workflow.steps.findIndex((x) => x.id === selected.id)}
            total={workflow.steps.length}
            options={options}
            pending={pending}
            onSave={(patch) => run(() => updateWorkflowStep(workflow.id, { ...selected, ...patch }))}
            onMove={(d) => run(() => moveWorkflowStep(workflow.id, selected.id, d))}
            onDelete={() => {
              if (!confirm("Delete this step?")) return;
              setSelectedId(null);
              run(() => deleteWorkflowStep(workflow.id, selected.id));
            }}
          />
        ) : (
          <div className="rounded-lg border p-4 text-sm text-[var(--muted-foreground)]">
            <p className="font-medium text-[var(--foreground)]">The trigger</p>
            <p className="mt-1 text-xs">
              What starts this sequence, and what it is narrowed to, is set on the green box
              itself. Click any step to edit it here.
            </p>
          </div>
        )}
        <p className="text-xs text-[var(--muted-foreground)]">
          Placeholders: {WORKFLOW_PLACEHOLDERS.map((p) => `{{${p}}}`).join(" · ")}
        </p>
      </aside>
      </div>
    </div>
  );
}

/**
 * The arrow between two nodes.
 *
 * It was a bare line, and a line between two boxes is ambiguous - it could mean "these
 * are related". An arrowhead says which way time runs, which is the one thing a
 * sequence has to communicate before anything else on the screen matters.
 */
function Connector() {
  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      <div className="h-6 w-px bg-[var(--field-border)]" />
      <svg viewBox="0 0 12 8" className="-mt-px h-2 w-3 fill-[var(--field-border)]">
        <path d="M6 8 0 0h12z" />
      </svg>
    </div>
  );
}

/** What each kind of node calls itself on its chip. A message says which channel it
 *  is, because "MESSAGE" is the one label that does not tell you what will happen. */
function kindLabel(s: WorkflowStepView): string {
  if (s.kind === "DELAY") return "WAIT";
  if (s.kind === "TAG") return "TAG";
  if (s.kind === "SUBFLOW") return "HAND OVER";
  if (s.kind === "WEBHOOK") return "WEBHOOK";
  if (s.kind === "UNSUBSCRIBE") return "UNSUBSCRIBE";
  if (s.kind === "NOTIFY_OWNER") return "NOTIFY ME";
  if (s.kind === "EXIT") return "END";
  if (s.kind !== "MESSAGE") return s.kind;
  return s.channel === "WABA" ? "WHATSAPP" : "EMAIL";
}

// 🟡 BRANCH, LOOP and EXIT are in the enum but the builder offers none of them, so a
// step can only carry one if it was written by something other than this screen. They
// are listed here because the map has to be total, and given a colour that reads as
// "not one of ours" rather than a fourth ordinary kind.
const KIND_CLASS: Record<WorkflowStepView["kind"], string> = {
  MESSAGE: "border-sky-500/40",
  DELAY: "border-amber-500/40",
  TAG: "border-violet-500/40",
  SUBFLOW: "border-teal-500/40",
  WEBHOOK: "border-slate-500/40",
  UNSUBSCRIBE: "border-rose-500/40",
  NOTIFY_OWNER: "border-indigo-500/40",
  EXIT: "border-rose-500/40",
  // Still nothing the builder offers. BRANCH and LOOP wait for a canvas that can draw
  // them; ZOOM_MEETING waits for a workflow that has an appointment to put a link on.
  BRANCH: "border-dashed border-[var(--field-border)]",
  LOOP: "border-dashed border-[var(--field-border)]",
  ZOOM_MEETING: "border-dashed border-[var(--field-border)]",
};

/**
 * The one line a collapsed node shows.
 *
 * 🔴 This is what turns the column from a stack of forms into a flowchart. Every card
 * used to render its whole form at once, so reading a five-step sequence meant
 * scrolling through five forms to learn five facts. The node says the fact; the form
 * is behind it when you want to change it.
 */
function stepSummary(s: WorkflowStepView, options: BuilderOptions): string {
  if (s.kind === "DELAY") {
    const n = s.delayAmount ?? 0;
    if (n === 0) return "Straight after the step above";
    const unit = DELAY_UNITS.find((u) => u.value === s.delayUnit)?.label ?? "minutes";
    return `Wait ${n} ${n === 1 ? unit.replace(/s$/, "") : unit}`;
  }
  if (s.kind === "TAG") {
    const verb = s.tagAction === "REMOVE" ? "Remove tag" : "Add tag";
    const name = options.tags.find((t) => t.id === s.tagId)?.name;
    return name ? `${verb}: ${name}` : `${verb} (none picked yet)`;
  }
  if (s.kind === "SUBFLOW") {
    const name = options.workflows.find((w) => w.id === s.targetWorkflowId)?.name;
    return name ? `Hand them to: ${name}` : "No sequence picked yet";
  }
  if (s.kind === "WEBHOOK") {
    const name = options.webhooks.find((w) => w.id === s.webhookId)?.name;
    return name ? `Call: ${name}` : "No endpoint picked yet";
  }
  if (s.kind === "NOTIFY_OWNER") return s.subject.trim() || "No subject yet";
  if (s.kind === "UNSUBSCRIBE") return "Take them off the list";
  if (s.kind === "EXIT") return "Stop here. Nothing below this runs.";
  if (s.channel === "WABA") {
    return s.wabaTemplate ? `Template: ${s.wabaTemplate}` : "No template picked yet";
  }
  return s.subject.trim() || "No subject yet";
}

/** A node that cannot send anything yet opens itself, so a half-built step is never
 *  hidden behind a tidy summary that says it is fine. */
function stepIncomplete(s: WorkflowStepView): boolean {
  if (s.kind === "DELAY") return s.delayUnit === null;
  if (s.kind === "TAG") return !s.tagId;
  if (s.kind === "SUBFLOW") return !s.targetWorkflowId;
  if (s.kind === "WEBHOOK") return !s.webhookId;
  if (s.kind === "NOTIFY_OWNER") return !s.subject.trim() || !s.body.trim();
  // Neither takes any configuration, so neither can be unfinished.
  if (s.kind === "UNSUBSCRIBE" || s.kind === "EXIT") return false;
  return s.channel === "WABA" ? !s.wabaTemplate : !s.subject.trim() || !s.body.trim();
}

/** The foot of the flow. Without it the last arrow points at nothing and the column
 *  reads as unfinished rather than as ended. */
function EndNode() {
  return (
    <div className="mx-auto rounded-full border border-dashed px-4 py-1.5 text-xs text-[var(--muted-foreground)]">
      Sequence ends
    </div>
  );
}

/**
 * One box in the column.
 *
 * It shows what the step DOES, never how it is configured: the whole point of moving
 * the form into a panel is that the column stays readable as a sequence. A box you can
 * read at a glance is what makes a missing step obvious, and a missing step is the
 * commonest fault in a sequence nobody can see.
 */
function StepNode({
  step,
  index,
  options,
  selected,
  onSelect,
}: {
  step: WorkflowStepView;
  index: number;
  options: BuilderOptions;
  selected: boolean;
  onSelect: () => void;
}) {
  const incomplete = stepIncomplete(step);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`w-full rounded-lg border-2 p-4 text-left transition ${KIND_CLASS[step.kind]} ${
        selected ? "ring-2 ring-[var(--ring,theme(colors.sky.500))] ring-offset-1 ring-offset-[var(--background)]" : "hover:bg-[var(--muted)]/40"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--muted-foreground)]">
          {index + 1} · {kindLabel(step)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{stepSummary(step, options)}</span>
        {/* 🔴 Said on the BOX, not only in the panel. An unfinished step is why a
            published workflow does nothing, and the owner has to be able to see which
            one it is without opening all five. */}
        {incomplete ? (
          <span className="shrink-0 rounded-full border border-amber-500/60 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            Unfinished
          </span>
        ) : null}
      </div>
      {step.kind === "MESSAGE" && step.sentCount + step.failedCount > 0 ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Sent {step.sentCount} · failed {step.failedCount} · skipped {step.skippedCount}
        </p>
      ) : null}
    </button>
  );
}

/**
 * The + that lives in a gap.
 *
 * Collapsed to a single + until it is wanted, because a row of three buttons repeated
 * in every gap is more chrome than sequence. Opening it in place is what makes "put a
 * wait between these two" one click rather than add-then-move-up-four-times.
 */
function Inserter({
  pending,
  onAdd,
}: {
  pending: boolean;
  onAdd: (kind: OfferedStepKind) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Add a step here"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed text-sm leading-none text-[var(--muted-foreground)] hover:border-solid hover:bg-[var(--muted)]"
        >
          +
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-dashed p-2">
      {OFFERED_STEP_KINDS.map((k) => (
        <Button
          key={k}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            onAdd(k);
          }}
        >
          {STEP_KIND_LABEL[k]}
        </Button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-[var(--muted-foreground)] underline"
      >
        Cancel
      </button>
    </div>
  );
}

function StepCard({
  step,
  index,
  total,
  options,
  workflowId,
  pending,
  onSave,
  onMove,
  onDelete,
}: {
  step: WorkflowStepView;
  index: number;
  total: number;
  options: BuilderOptions;
  /** So a hand-over step cannot be pointed at the sequence it lives in. */
  workflowId: string;
  pending: boolean;
  onSave: (patch: Partial<WorkflowStepView>) => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [v, setV] = useState(step);
  // 🟡 Always open. This card now lives in the properties panel, which only ever shows
  // the one step you selected, so a collapse toggle would hide the only thing the
  // panel is for. The summary that used to need expanding is on the box instead.
  const open = true;
  const set = (patch: Partial<WorkflowStepView>) => setV((x) => ({ ...x, ...patch }));
  const template = options.wabaTemplates.find((t) => t.name === v.wabaTemplate);

  return (
    <div className={`rounded-lg border-2 p-4 ${KIND_CLASS[step.kind]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--muted-foreground)]">
            {index + 1} · {kindLabel(v)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {stepSummary(v, options)}
          </span>
        </div>
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

      {/* The numbers stay on the closed node. A statistic you have to open a form to
          read is a statistic nobody checks. */}
      {!open && step.kind === "MESSAGE" && step.sentCount + step.failedCount > 0 ? (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Sent {step.sentCount} · failed {step.failedCount} · skipped {step.skippedCount}
        </p>
      ) : null}

      {!open ? null : (
      <>
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

      {step.kind === "SUBFLOW" ? (
        <div className="mt-3 flex flex-col gap-2">
          <Field label="Hand them to">
            <Select
              value={v.targetWorkflowId ?? ""}
              placeholder="Pick a sequence"
              options={options.workflows
                // Never itself. A sequence that hands somebody to itself is the one
                // mistake the enroller's guard turns into silence rather than a loop.
                .filter((w) => w.id !== workflowId)
                .map((w) => ({ value: w.id, label: w.name }))}
              onChange={(id) => {
                set({ targetWorkflowId: id });
                onSave({ targetWorkflowId: id });
              }}
            />
          </Field>
          <p className="text-xs text-[var(--muted-foreground)]">
            Only published sequences appear here. They carry on through this one as well, so
            put an End step below if this is meant to be a handover rather than a copy.
          </p>
        </div>
      ) : null}

      {step.kind === "WEBHOOK" ? (
        <div className="mt-3 flex flex-col gap-2">
          <Field label="Call">
            <Select
              value={v.webhookId ?? ""}
              placeholder="Pick an endpoint"
              options={options.webhooks.map((w) => ({ value: w.id, label: w.name }))}
              onChange={(id) => {
                set({ webhookId: id });
                onSave({ webhookId: id });
              }}
            />
          </Field>
          {options.webhooks.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              No endpoints yet. Add one on the Webhooks page first.
            </p>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">
              Posts this person to the endpoint, signed, as a workflow.step event. It is one of
              your registered endpoints rather than a URL typed here, on purpose.
            </p>
          )}
        </div>
      ) : null}

      {step.kind === "UNSUBSCRIBE" ? (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Takes them off the list, exactly as if they had clicked unsubscribe themselves.
          Nothing below this will reach them, and that is the point.
        </p>
      ) : null}

      {step.kind === "EXIT" ? (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Stops the sequence here. Every step below this one is left alone rather than
          deleted, which is how a tail is parked without losing what it said.
        </p>
      ) : null}

      {step.kind === "NOTIFY_OWNER" ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            🔴 This one goes to YOU, not to them. The placeholders still describe the lead, so
            {" "}{"{{firstName}}"} is who the sequence is about.
          </p>
          <Field label="Subject">
            <Input
              value={v.subject}
              placeholder="{{firstName}} reached the end of the sequence"
              onChange={(e) => set({ subject: e.target.value })}
              onBlur={() => onSave({ subject: v.subject })}
            />
          </Field>
          <Field label="What to say">
            <Textarea
              rows={4}
              value={v.body}
              placeholder={"{{firstName}} ({{email}}) finished the sequence and did not book."}
              onChange={(e) => set({ body: e.target.value })}
              onBlur={() => onSave({ body: v.body })}
            />
          </Field>
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
      </>
      )}
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
