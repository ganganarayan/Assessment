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
}
export interface QuestionData {
  id: string;
  text: string;
  weight: number;
  required: boolean;
  options: QuestionOptionData[];
}

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
}: {
  categoryId: string;
  questions: QuestionData[];
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
              <span className="font-medium">{q.text}</span>
              <span className="text-xs text-[var(--muted-foreground)]">
                weight {q.weight} · {q.required ? "required" : "optional"} ·{" "}
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

function QuestionForm({
  categoryId,
  questionId,
  initial,
  onDone,
  onCancel,
}: {
  categoryId: string;
  questionId?: string;
  initial?: QuestionData;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [weight, setWeight] = useState(String(initial?.weight ?? 1));
  const [required, setRequired] = useState(initial?.required ?? true);
  const [options, setOptions] = useState<{ uid: string; label: string; value: number }[]>(
    initial?.options.map((o) => ({ uid: o.id, label: o.label, value: o.value })) ??
      DEFAULT_OPTIONS.map((o) => ({ uid: crypto.randomUUID(), ...o })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function setOption(i: number, patch: Partial<{ label: string; value: number }>) {
    setOptions((opts) => opts.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  function submit() {
    setError(null);
    const input: QuestionInput = {
      text,
      weight: Number(weight),
      required,
      options: options.map((o) => ({ label: o.label, value: o.value })),
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
      <div className="flex flex-wrap items-end gap-4">
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
        <Label>Options (label · score)</Label>
        {options.map((o, i) => (
          <div key={o.uid} className="flex items-center gap-2">
            <Input
              value={o.label}
              onChange={(e) => setOption(i, { label: e.target.value })}
              placeholder="Label"
            />
            <Input
              type="number"
              className="w-24"
              value={o.value}
              onChange={(e) => setOption(i, { value: Number(e.target.value) })}
            />
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
        ))}
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() =>
            setOptions((opts) => [...opts, { uid: crypto.randomUUID(), label: "", value: opts.length + 1 }])
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
