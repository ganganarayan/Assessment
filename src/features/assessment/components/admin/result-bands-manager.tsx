"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createResultBand,
  updateResultBand,
  deleteResultBand,
} from "@/features/assessment/actions/result-band";
import type { ResultBandInput } from "@/features/assessment/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Level = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
const LEVELS: Level[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export interface BandData {
  id: string;
  level: Level;
  title: string;
  description: string | null;
  minScore: number;
  maxScore: number;
}

export function ResultBandsManager({
  assessmentId,
  bands,
}: {
  assessmentId: string;
  bands: BandData[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove(id: string) {
    if (!confirm("Delete this result band?")) return;
    start(async () => {
      await deleteResultBand(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {bands.map((b) =>
        editingId === b.id ? (
          <BandForm
            key={b.id}
            assessmentId={assessmentId}
            bandId={b.id}
            initial={b}
            onDone={() => {
              setEditingId(null);
              router.refresh();
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div
            key={b.id}
            className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{b.level}</Badge>
                <span className="font-medium">{b.title}</span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {b.minScore}–{b.maxScore}
                </span>
              </div>
              {b.description ? (
                <span className="text-xs text-[var(--muted-foreground)]">{b.description}</span>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="outline" onClick={() => setEditingId(b.id)}>Edit</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(b.id)}>Delete</Button>
            </div>
          </div>
        ),
      )}

      <BandForm
        assessmentId={assessmentId}
        onDone={() => router.refresh()}
        onCancel={() => {}}
        addMode
      />
    </div>
  );
}

function BandForm({
  assessmentId,
  bandId,
  initial,
  onDone,
  onCancel,
  addMode,
}: {
  assessmentId: string;
  bandId?: string;
  initial?: BandData;
  onDone: () => void;
  onCancel: () => void;
  addMode?: boolean;
}) {
  const [level, setLevel] = useState<Level>(initial?.level ?? "LOW");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [minScore, setMinScore] = useState(String(initial?.minScore ?? 0));
  const [maxScore, setMaxScore] = useState(String(initial?.maxScore ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const input: ResultBandInput = {
      level,
      title,
      description,
      minScore: Number(minScore),
      maxScore: Number(maxScore),
    };
    start(async () => {
      const res = bandId
        ? await updateResultBand(bandId, input)
        : await createResultBand(assessmentId, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (addMode) {
        setLevel("LOW");
        setTitle("");
        setDescription("");
        setMinScore("0");
        setMaxScore("0");
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
      {addMode ? <p className="text-sm font-medium">Add result band</p> : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label>Level</Label>
          <select
            className="h-10 rounded-md border bg-transparent px-3 text-sm"
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Min score</Label>
          <Input className="w-28" type="number" step="0.1" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Max score</Label>
          <Input className="w-28" type="number" step="0.1" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Result title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Result description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending || title.trim() === ""}>
          {pending ? "Saving…" : bandId ? "Save" : "Add band"}
        </Button>
        {!addMode ? (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
        ) : null}
      </div>
    </div>
  );
}
