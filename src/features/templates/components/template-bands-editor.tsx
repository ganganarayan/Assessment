"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  AssessmentBodyExport,
  CategoryBandExport,
  CategoryExport,
  ResultBandExport,
} from "@/features/assessment/transfer/schema";
import {
  Field,
  RowControls,
  SELECT_CLASS,
  move,
  removeAt,
  renumber,
  replaceAt,
} from "@/features/templates/components/template-editor-shared";

/**
 * What a score MEANS - overall, and per category.
 *
 * Both sets match against the score PERCENTAGE, 0 to 100, which is worth saying on the
 * screen: the option values on a question are raw points, and the one mistake nobody
 * catches by reading is a band written in points against a scale that is percentages.
 *
 * The per-category band label is a FREE TEXT field, not a LOW/MEDIUM/HIGH dropdown.
 * Most built-ins use those three words, but eight of them use their own - "Ceremonial",
 * "Transfer-capable", "A different trip" - and a dropdown would have silently rewritten
 * every one of those the first time a category was saved.
 */

const LEVELS: ResultBandExport["level"][] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function TemplateBandsEditor({
  body,
  onChange,
  disabled = false,
}: {
  body: AssessmentBodyExport;
  onChange: (next: AssessmentBodyExport) => void;
  disabled?: boolean;
}) {
  const bands = body.resultBands;

  const setBands = (next: ResultBandExport[]) => onChange({ ...body, resultBands: next });
  const setCategories = (next: CategoryExport[]) => onChange({ ...body, categories: next });

  function patchBand(i: number, patch: Partial<ResultBandExport>) {
    const b = bands[i];
    if (!b) return;
    setBands(replaceAt(bands, i, { ...b, ...patch }));
  }

  function patchCategoryBands(ci: number, next: CategoryBandExport[]) {
    const cat = body.categories[ci];
    if (!cat) return;
    setCategories(replaceAt(body.categories, ci, { ...cat, bands: next }));
  }

  /** Does the overall scale leave a gap or overlap? Reported, never corrected: the
   *  owner may be mid-edit, and a band that silently moved is worse than a sentence. */
  const coverage = (() => {
    const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
    const problems: string[] = [];
    for (let i = 0; i < sorted.length; i += 1) {
      const b = sorted[i];
      if (!b) continue;
      if (b.maxScore < b.minScore) problems.push(`"${b.title}" ends before it starts.`);
      const next = sorted[i + 1];
      if (!next) continue;
      if (next.minScore > b.maxScore + 1) problems.push(`Nothing covers ${b.maxScore + 1} to ${next.minScore - 1}.`);
      if (next.minScore <= b.maxScore) problems.push(`"${b.title}" and "${next.title}" overlap.`);
    }
    if (sorted.length > 0) {
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (first && first.minScore > 0) problems.push(`Nothing covers 0 to ${first.minScore - 1}.`);
      if (last && last.maxScore < 100) problems.push(`Nothing covers ${last.maxScore + 1} to 100.`);
    }
    return problems;
  })();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Overall result bands</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Matched against the total score as a percentage, 0 to 100.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              setBands([
                ...bands,
                {
                  level: "MEDIUM",
                  title: "",
                  minScore: 0,
                  maxScore: 100,
                  displayOrder: bands.length,
                },
              ])
            }
          >
            + Add band
          </Button>
        </div>

        {coverage.length > 0 ? (
          <div className="rounded-md border border-yellow-600/40 bg-yellow-600/5 p-3 text-sm">
            <p className="font-medium">Worth a look before this template ships:</p>
            <ul className="mt-1 list-inside list-disc text-xs">
              {coverage.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {bands.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-[var(--muted-foreground)]">
            No bands. A scored template with no bands gives a number and no meaning.
          </p>
        ) : null}

        {bands.map((b, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Band {i + 1}</span>
              <RowControls
                index={i}
                count={bands.length}
                disabled={disabled}
                onMove={(from, to) => setBands(renumber(move(bands, from, to)))}
                onRemove={() => setBands(renumber(removeAt(bands, i)))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Level">
                <select
                  className={SELECT_CLASS}
                  value={b.level}
                  disabled={disabled}
                  onChange={(e) => patchBand(i, { level: e.target.value as ResultBandExport["level"] })}
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Title" hint="What the respondent reads.">
                <Input
                  value={b.title}
                  disabled={disabled}
                  onChange={(e) => patchBand(i, { title: e.target.value })}
                />
              </Field>
              <Field label="From %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={b.minScore}
                  disabled={disabled}
                  onChange={(e) => patchBand(i, { minScore: Number(e.target.value) })}
                />
              </Field>
              <Field label="To %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={b.maxScore}
                  disabled={disabled}
                  onChange={(e) => patchBand(i, { maxScore: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="What this band means">
              <Textarea
                rows={3}
                value={b.description ?? ""}
                disabled={disabled}
                onChange={(e) => patchBand(i, { description: e.target.value })}
              />
            </Field>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3 border-t pt-4">
        <div>
          <p className="text-sm font-medium">Per-category bands</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            What a score in one category means. Optional - a category with none simply scores and says
            nothing about itself.
          </p>
        </div>

        {body.categories.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No categories to band yet.</p>
        ) : null}

        {body.categories.map((cat, ci) => {
          const catBands = cat.bands ?? [];
          return (
            <div key={cat.key ?? `c_${ci}`} className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{cat.name || "Untitled category"}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    patchCategoryBands(ci, [
                      ...catBands,
                      { label: "", meaning: "", minScore: 0, maxScore: 100, displayOrder: catBands.length },
                    ])
                  }
                >
                  + Add band
                </Button>
              </div>

              {catBands.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)]">No bands for this category.</p>
              ) : null}

              {catBands.map((b, bi) => (
                <div key={bi} className="flex flex-col gap-2 rounded-md border bg-[var(--muted)]/20 p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Label" hint="LOW / MEDIUM / HIGH, or your own word.">
                      <Input
                        value={b.label}
                        disabled={disabled}
                        onChange={(e) =>
                          patchCategoryBands(ci, replaceAt(catBands, bi, { ...b, label: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="From %">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={b.minScore}
                        disabled={disabled}
                        onChange={(e) =>
                          patchCategoryBands(ci, replaceAt(catBands, bi, { ...b, minScore: Number(e.target.value) }))
                        }
                      />
                    </Field>
                    <Field label="To %">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={b.maxScore}
                        disabled={disabled}
                        onChange={(e) =>
                          patchCategoryBands(ci, replaceAt(catBands, bi, { ...b, maxScore: Number(e.target.value) }))
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Suggestion">
                    <Textarea
                      rows={2}
                      value={b.meaning ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        patchCategoryBands(ci, replaceAt(catBands, bi, { ...b, meaning: e.target.value }))
                      }
                    />
                  </Field>
                  <div className="flex justify-end">
                    <RowControls
                      index={bi}
                      count={catBands.length}
                      disabled={disabled}
                      onMove={(from, to) => patchCategoryBands(ci, renumber(move(catBands, from, to)))}
                      onRemove={() => patchCategoryBands(ci, renumber(removeAt(catBands, bi)))}
                    />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}
