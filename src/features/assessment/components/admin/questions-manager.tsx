"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
} from "@/features/assessment/actions/question";
import type { QuestionInput } from "@/features/assessment/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface QuestionOptionData {
  id: string;
  label: string;
  value: number;
  diagnosisClause?: string | null;
  isAssumption?: boolean;
}
export interface QuestionData {
  id: string;
  text: string;
  weight: number;
  required: boolean;
  scoringRole?: string | null;
  scoringUnit?: string | null;
  options: QuestionOptionData[];
}

/** How this question's numbers are expressed — applies to BOTH the option values
 *  and the respondent's typed actual number, so a question worded "out of every
 *  10" can never be read as a percentage. */
const CLINIC_UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Default for the role" },
  { value: "PER_10", label: "Out of 10 (e.g. “7 or 8”)" },
  { value: "PER_100", label: "Out of 100 / percent (e.g. “25–40”)" },
  { value: "RUPEES", label: "Rupees ₹" },
  { value: "COUNT", label: "Plain count" },
  { value: "POINTS", label: "Uplift points (whole percent)" },
];

/** Engine of the parent assessment — CLINIC_AUDIT unlocks the funnel scoring fields. */
export type BuilderEngine = "GENERIC" | "CLINIC_AUDIT";

/** Clinic-audit funnel roles (must match ClinicRole in lib/scoring/clinic-audit.ts). */
const CLINIC_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— not scored —" },
  { value: "ENQUIRIES", label: "Enquiries / month (E)" },
  { value: "BOOK_RATE", label: "Booking rate % (B)" },
  { value: "SHOWUP_RATE", label: "Show-up rate % (S)" },
  { value: "CLOSE_RATE", label: "Close rate % (C)" },
  { value: "TREATMENT_VALUE", label: "Treatment value ₹ (V)" },
  { value: "AD_SPEND", label: "Ad spend ₹ (A)" },
  { value: "DORMANT", label: "Dormant list (D)" },
  { value: "CAPACITY", label: "Spare capacity (K)" },
  { value: "UPLIFT_BOOKRATE", label: "Book-rate uplift points" },
];
const ROLE_LABEL = new Map(CLINIC_ROLE_OPTIONS.map((r) => [r.value, r.label]));

const DEFAULT_OPTIONS = [
  { label: "Never", value: 1 },
  { label: "Rarely", value: 2 },
  { label: "Often", value: 3 },
  { label: "Very Often", value: 4 },
];

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

export function QuestionsManager({
  categoryId,
  questions,
  engine = "GENERIC",
}: {
  categoryId: string;
  questions: QuestionData[];
  engine?: BuilderEngine;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reorder(from: number, to: number) {
    const ordered = move(questions, from, to);
    start(async () => {
      await reorderQuestions(
        categoryId,
        ordered.map((q) => q.id),
      );
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this question?")) return;
    start(async () => {
      await deleteQuestion(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {questions.map((q, i) =>
        editingId === q.id ? (
          <QuestionForm
            key={q.id}
            categoryId={categoryId}
            questionId={q.id}
            initial={q}
            engine={engine}
            onDone={() => {
              setEditingId(null);
              router.refresh();
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div
            key={q.id}
            className="flex items-start justify-between gap-3 rounded-md border bg-[var(--background)] p-3 text-sm"
          >
            <div className="flex flex-col gap-1">
              <span className="font-medium">
                {q.text}
                {engine === "CLINIC_AUDIT" && q.scoringRole ? (
                  <span className="ml-2 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    {ROLE_LABEL.get(q.scoringRole) ?? q.scoringRole}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {engine === "CLINIC_AUDIT" ? null : <>weight {q.weight} · </>}
                {q.required ? "required" : "optional"} ·{" "}
                {q.options.map((o) => `${o.label}(${o.value})`).join(", ")}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="ghost" disabled={pending || i === 0} onClick={() => reorder(i, i - 1)}>↑</Button>
              <Button size="sm" variant="ghost" disabled={pending || i === questions.length - 1} onClick={() => reorder(i, i + 1)}>↓</Button>
              <Button size="sm" variant="outline" onClick={() => setEditingId(q.id)}>Edit</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(q.id)}>Delete</Button>
            </div>
          </div>
        ),
      )}

      {adding ? (
        <QuestionForm
          categoryId={categoryId}
          engine={engine}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          + Add question
        </Button>
      )}
    </div>
  );
}

interface OptionRow {
  uid: string;
  label: string;
  value: number;
  clause: string;
  dontKnow: boolean;
}

function QuestionForm({
  categoryId,
  questionId,
  initial,
  engine = "GENERIC",
  onDone,
  onCancel,
}: {
  categoryId: string;
  questionId?: string;
  initial?: QuestionData;
  engine?: BuilderEngine;
  onDone: () => void;
  onCancel: () => void;
}) {
  const clinic = engine === "CLINIC_AUDIT";
  const [text, setText] = useState(initial?.text ?? "");
  const [weight, setWeight] = useState(String(initial?.weight ?? 1));
  const [required, setRequired] = useState(initial?.required ?? true);
  const [role, setRole] = useState(initial?.scoringRole ?? "");
  const [unit, setUnit] = useState(initial?.scoringUnit ?? "");
  const [options, setOptions] = useState<OptionRow[]>(
    initial?.options.map((o) => ({
      uid: o.id,
      label: o.label,
      value: o.value,
      clause: o.diagnosisClause ?? "",
      dontKnow: o.isAssumption ?? false,
    })) ??
      DEFAULT_OPTIONS.map((o) => ({ uid: crypto.randomUUID(), ...o, clause: "", dontKnow: false })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function setOption(i: number, patch: Partial<Omit<OptionRow, "uid">>) {
    setOptions((opts) => opts.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  function submit() {
    setError(null);
    const input: QuestionInput = {
      text,
      weight: Number(weight),
      required,
      scoringRole: clinic ? role : "",
      scoringUnit: clinic ? unit : "",
      options: options.map((o) => ({
        label: o.label,
        value: o.value,
        diagnosisClause: clinic ? o.clause : "",
        isAssumption: clinic ? o.dontKnow : false,
      })),
    };
    start(async () => {
      const res = questionId
        ? await updateQuestion(questionId, input)
        : await createQuestion(categoryId, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-[var(--muted)] p-3">
      <div className="flex flex-col gap-2">
        <Label>Question text</Label>
        <Input value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      {clinic ? (
        <div className="flex flex-col gap-2">
          <Label>Scoring role</Label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-10 max-w-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
          >
            {CLINIC_ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <p className="text-xs text-[var(--muted-foreground)]">
            What this question feeds in the funnel math. Leave as &ldquo;not scored&rdquo; for
            qualifier questions.
          </p>
          {role ? (
            <div className="mt-2 flex flex-col gap-2">
              <Label>Numbers are expressed in</Label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="h-10 max-w-xs rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
              >
                {CLINIC_UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
              <p className="text-xs text-[var(--muted-foreground)]">
                Applies to the option numbers below <em>and</em> the respondent&apos;s typed actual
                number. <strong>Leave on &ldquo;Default&rdquo; unless you need to override.</strong>{" "}
                The scale is read from your question&apos;s own wording — a question asking
                &ldquo;out of every 10&rdquo; answered 7 scores as 70%, one asking &ldquo;out of
                every 100&rdquo; answered 10 scores as 10%. Set this only if a question&apos;s
                wording is ambiguous.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        {clinic ? null : (
          <div className="flex flex-col gap-2">
            <Label>Weight</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              className="w-24"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
        )}
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{clinic ? "Options (label · number)" : "Options (label · score)"}</Label>
        {options.map((o, i) => (
          <div key={o.uid} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                value={o.label}
                onChange={(e) => setOption(i, { label: e.target.value })}
                placeholder="Label"
              />
              <Input
                type="number"
                className="w-28"
                value={o.value}
                onChange={(e) => setOption(i, { value: Number(e.target.value) })}
              />
              {clinic ? (
                <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-[var(--muted-foreground)]">
                  <input
                    type="checkbox"
                    checked={o.dontKnow}
                    onChange={(e) => setOption(i, { dontKnow: e.target.checked })}
                  />
                  &ldquo;don&apos;t know&rdquo;
                </label>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                type="button"
                disabled={options.length <= 2}
                onClick={() => setOptions((opts) => opts.filter((_, idx) => idx !== i))}
              >
                ✕
              </Button>
            </div>
            {clinic ? (
              <Input
                value={o.clause}
                onChange={(e) => setOption(i, { clause: e.target.value })}
                placeholder="Diagnosis line for this answer (optional — shown if it's a top-2 weakness)"
                className="text-xs"
              />
            ) : null}
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() =>
            setOptions((opts) => [
              ...opts,
              { uid: crypto.randomUUID(), label: "", value: opts.length + 1, clause: "", dontKnow: false },
            ])
          }
        >
          + Add option
        </Button>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save question"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
