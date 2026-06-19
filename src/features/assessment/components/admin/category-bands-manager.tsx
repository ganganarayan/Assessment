"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCategoryBand,
  updateCategoryBand,
  deleteCategoryBand,
} from "@/features/assessment/actions/category-band";
import type { CategoryBandInput } from "@/features/assessment/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Level = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
const LEVELS: Level[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const asLevel = (s: string): Level => (LEVELS.includes(s as Level) ? (s as Level) : "LOW");

/**
 * Default suggestion text per level so the admin can pick a level and tweak,
 * rather than typing from scratch. Auto-filled only while the box is empty or
 * still holds one of these defaults (a manual edit is never overwritten).
 */
const DEFAULT_SUGGESTIONS: Record<Level, string> = {
  LOW: "This area is a clear strength — keep doing what's working here.",
  MEDIUM: "This area is steady, with room to grow.",
  HIGH: "This area needs attention soon.",
  CRITICAL: "This area needs urgent focus.",
};
const DEFAULT_VALUES = new Set<string>(Object.values(DEFAULT_SUGGESTIONS));

export interface CategoryOption {
  id: string;
  name: string;
}
export interface CategoryBandData {
  id: string;
  categoryId: string;
  categoryName: string;
  level: string; // stored label; one of LEVELS in practice
  suggestion: string | null;
  minScore: number;
  maxScore: number;
}

const SELECT_CLASS =
  "h-10 rounded-md border bg-[var(--background)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60";

/** Levels still free for a category (excluding the band being edited, if any). */
function freeLevels(bands: CategoryBandData[], categoryId: string, excludeId?: string): Level[] {
  const used = new Set(
    bands
      .filter((b) => b.categoryId === categoryId && b.id !== excludeId)
      .map((b) => asLevel(b.level)),
  );
  return LEVELS.filter((l) => !used.has(l));
}

export function CategoryBandsManager({
  categories,
  bands,
}: {
  categories: CategoryOption[];
  bands: CategoryBandData[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (categories.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Add at least one category above, then you can define its evaluation bands here.
      </p>
    );
  }

  function remove(id: string) {
    if (!confirm("Delete this category band?")) return;
    start(async () => {
      await deleteCategoryBand(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {bands.map((b) =>
        editingId === b.id ? (
          <BandForm
            key={b.id}
            categories={categories}
            bands={bands}
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
                <span className="font-medium">{b.categoryName}</span>
                <Badge variant="outline">{b.level}</Badge>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {b.minScore}–{b.maxScore}%
                </span>
              </div>
              {b.suggestion ? (
                <span className="text-xs text-[var(--muted-foreground)]">{b.suggestion}</span>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="outline" onClick={() => setEditingId(b.id)}>Edit</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(b.id)}>Delete</Button>
            </div>
          </div>
        ),
      )}

      <BandForm categories={categories} bands={bands} onDone={() => router.refresh()} onCancel={() => {}} addMode />
    </div>
  );
}

function BandForm({
  categories,
  bands,
  bandId,
  initial,
  onDone,
  onCancel,
  addMode,
}: {
  categories: CategoryOption[];
  bands: CategoryBandData[];
  bandId?: string;
  initial?: CategoryBandData;
  onDone: () => void;
  onCancel: () => void;
  addMode?: boolean;
}) {
  const firstCategoryId = categories[0]?.id ?? "";
  const initialCategoryId = initial?.categoryId ?? firstCategoryId;
  const initialFree = freeLevels(bands, initialCategoryId, bandId);
  const initialLevel = asLevel(initial?.level ?? initialFree[0] ?? "LOW");

  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [level, setLevel] = useState<Level>(initialLevel);
  const [suggestion, setSuggestion] = useState(
    initial?.suggestion ?? (addMode ? DEFAULT_SUGGESTIONS[initialLevel] : ""),
  );
  const [minScore, setMinScore] = useState(String(initial?.minScore ?? 0));
  const [maxScore, setMaxScore] = useState(String(initial?.maxScore ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const available = freeLevels(bands, categoryId, bandId);
  const noneLeft = available.length === 0;

  /** Fill the suggestion with the level's default — unless the admin typed their own. */
  function autofill(next: Level) {
    setSuggestion((prev) =>
      prev.trim() === "" || DEFAULT_VALUES.has(prev.trim()) ? DEFAULT_SUGGESTIONS[next] : prev,
    );
  }

  function onCategoryChange(nextCat: string) {
    setCategoryId(nextCat);
    const nextLevel = freeLevels(bands, nextCat, bandId)[0] ?? "LOW";
    setLevel(nextLevel);
    autofill(nextLevel);
  }

  function onLevelChange(next: Level) {
    setLevel(next);
    autofill(next);
  }

  function submit() {
    setError(null);
    const input: CategoryBandInput = {
      categoryId,
      level,
      suggestion,
      minScore: Number(minScore),
      maxScore: Number(maxScore),
    };
    start(async () => {
      const res = bandId
        ? await updateCategoryBand(bandId, input)
        : await createCategoryBand(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (addMode) {
        // advance to the next free level for the same category (if any)
        const stillFree = freeLevels(bands, categoryId, bandId).filter((l) => l !== level);
        const nextLevel = stillFree[0] ?? "LOW";
        setLevel(nextLevel);
        setSuggestion(DEFAULT_SUGGESTIONS[nextLevel]);
        setMinScore("0");
        setMaxScore("0");
      }
      onDone();
    });
  }

  // Levels offered: the free ones, plus this band's own level when editing.
  const levelOptions =
    bandId && !available.includes(level) ? [level, ...available] : available;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
      {addMode ? <p className="text-sm font-medium">Add category band</p> : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label>Category</Label>
          <select
            className={SELECT_CLASS}
            value={categoryId}
            onChange={(e) => onCategoryChange(e.target.value)}
            disabled={!addMode}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Level</Label>
          <select
            className={SELECT_CLASS}
            value={level}
            onChange={(e) => onLevelChange(e.target.value as Level)}
            disabled={addMode && noneLeft}
          >
            {levelOptions.map((l) => (
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
        <Label>Suggestion (shown on the destination page for this category)</Label>
        <Textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />
      </div>
      {addMode && noneLeft ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          All four levels are already set for this category. Pick another category, or edit/delete an existing band.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending || categoryId === "" || (addMode && noneLeft)}>
          {pending ? "Saving…" : bandId ? "Save" : "Add band"}
        </Button>
        {!addMode ? (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
        ) : null}
      </div>
    </div>
  );
}
