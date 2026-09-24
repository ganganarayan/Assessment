"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createResultBand,
  updateResultBand,
  deleteResultBand,
  importResultBandsFromText,
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

  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  function remove(id: string) {
    if (!confirm("Delete this result band?")) return;
    start(async () => {
      await deleteResultBand(id);
      router.refresh();
    });
  }

  function runImport() {
    if (!importText.trim()) return;
    if (bands.length > 0 && !confirm(`This replaces the current ${bands.length} result band(s) with the ones from your text. Continue?`)) return;
    setImportErr(null);
    start(async () => {
      const res = await importResultBandsFromText(assessmentId, importText);
      if (!res.ok) { setImportErr(res.error ?? "Import failed."); return; }
      setImportText("");
      setShowImport(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Bulk import from a compact text spec (ranges + names). */}
      <div className="rounded-md border border-dashed p-3">
        <button
          type="button"
          className="text-sm font-medium underline"
          onClick={() => setShowImport((v) => !v)}
        >
          {showImport ? "Hide import" : "Import bands from text"}
        </button>
        {showImport ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs text-[var(--muted-foreground)]">
              Type the score ranges and the band names — the parser fills the rest and levels auto-assign
              (LOW→CRITICAL). Everything stays editable below. Example:
              <br />
              <span className="font-mono">0-40% low, 41-55, 56-75, 76-100. Holding, Load-Bearing, Running Hot, Redlined</span>
            </p>
            <Textarea
              rows={3}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="0-40, 41-55, 56-75, 76-100. Holding, Load-Bearing, Running Hot, Redlined"
              spellCheck={false}
              className="font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={runImport} disabled={pending || !importText.trim()}>
                {pending ? "Filling…" : "Fill bands"}
              </Button>
              {importErr ? <span className="text-sm text-red-500">{importErr}</span> : null}
            </div>
          </div>
        ) : null}
      </div>

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
                  {b.minScore}–{b.maxScore}%
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
            className="h-10 rounded-md border border-cyan-500 bg-transparent px-3 text-sm focus:bg-white focus:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Min %</Label>
          <Input className="w-28" type="number" step="1" min={0} max={100} value={minScore} onChange={(e) => setMinScore(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Max %</Label>
          <Input className="w-28" type="number" step="1" min={0} max={100} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Result title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Suggestion / description (shown on the destination page)</Label>
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
