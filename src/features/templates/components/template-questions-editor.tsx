"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  AssessmentBodyExport,
  CategoryExport,
  QuestionExport,
  OptionExport,
} from "@/features/assessment/transfer/schema";
import {
  Field,
  RowControls,
  SELECT_CLASS,
  move,
  newKey,
  removeAt,
  renumber,
  replaceAt,
} from "@/features/templates/components/template-editor-shared";

/**
 * Questions and categories, edited on the template document itself.
 *
 * This is the screen the whole feature was asked for: reaching one question without
 * reading a 1,400-line file. So the categories start COLLAPSED and say how many
 * questions each holds - a library template has six or seven of them, and opening the
 * step onto every question of every category would be the same wall of text with
 * nicer fonts.
 *
 * 🔴 KEYS ARE NEVER REWRITTEN. A question's `key` is what a conditional route points
 * at; a category's `key` is what a JUMP_TO_CATEGORY route points at. Editing the text
 * of a question must leave its key exactly as it was, or every branch aimed at it goes
 * nowhere - and nothing would look wrong until a respondent took the funnel. Delete is
 * the one place a key can disappear, so delete CHECKS first and says who is pointing.
 */

/** Every question key and category key that some route targets, with who points at it. */
function routeReferences(body: AssessmentBodyExport): {
  questions: Map<string, string[]>;
  categories: Map<string, string[]>;
} {
  const questions = new Map<string, string[]>();
  const categories = new Map<string, string[]>();
  const note = (map: Map<string, string[]>, key: string | null | undefined, who: string) => {
    const k = (key ?? "").trim();
    if (!k) return;
    map.set(k, [...(map.get(k) ?? []), who]);
  };

  for (const cat of body.categories) {
    for (const q of cat.questions) {
      const who = `"${q.text.slice(0, 40)}"`;
      note(questions, q.defaultRoute?.targetQuestionKey, who);
      note(categories, q.defaultRoute?.targetCategoryKey, who);
      for (const o of q.options) {
        const whoOpt = `${who} → ${o.label.slice(0, 24)}`;
        note(questions, o.route?.targetQuestionKey, whoOpt);
        note(categories, o.route?.targetCategoryKey, whoOpt);
      }
    }
  }
  return { questions, categories };
}

function blankQuestion(order: number): QuestionExport {
  return {
    key: newKey("q"),
    text: "",
    type: "SINGLE_SELECT",
    weight: 1,
    required: true,
    displayOrder: order,
    options: [
      { label: "", value: 0, displayOrder: 0 },
      { label: "", value: 1, displayOrder: 1 },
    ],
  };
}

function blankCategory(order: number): CategoryExport {
  return {
    key: newKey("c"),
    name: "",
    displayOrder: order,
    questions: [],
  };
}

export function TemplateQuestionsEditor({
  body,
  onChange,
  disabled = false,
}: {
  body: AssessmentBodyExport;
  onChange: (next: AssessmentBodyExport) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const clinic = body.engine === "CLINIC_AUDIT";
  const refs = routeReferences(body);

  const setCategories = (next: CategoryExport[]) => onChange({ ...body, categories: next });

  function patchCategory(ci: number, patch: Partial<CategoryExport>) {
    const cat = body.categories[ci];
    if (!cat) return;
    setCategories(replaceAt(body.categories, ci, { ...cat, ...patch }));
  }

  function patchQuestion(ci: number, qi: number, patch: Partial<QuestionExport>) {
    const cat = body.categories[ci];
    const q = cat?.questions[qi];
    if (!cat || !q) return;
    patchCategory(ci, { questions: replaceAt(cat.questions, qi, { ...q, ...patch }) });
  }

  function patchOption(ci: number, qi: number, oi: number, patch: Partial<OptionExport>) {
    const q = body.categories[ci]?.questions[qi];
    const o = q?.options[oi];
    if (!q || !o) return;
    patchQuestion(ci, qi, { options: replaceAt(q.options, oi, { ...o, ...patch }) });
  }

  function removeQuestion(ci: number, qi: number) {
    const cat = body.categories[ci];
    const q = cat?.questions[qi];
    if (!cat || !q) return;
    const pointing = q.key ? refs.questions.get(q.key) : undefined;
    if (pointing?.length) {
      setWarning(
        `"${q.text.slice(0, 60)}" cannot be deleted yet: ${pointing.length} answer${pointing.length === 1 ? "" : "s"} route to it (${pointing.slice(0, 3).join(", ")}). Point those somewhere else first, or the funnel branches into nothing.`,
      );
      return;
    }
    setWarning(null);
    patchCategory(ci, { questions: renumber(removeAt(cat.questions, qi)) });
  }

  function removeCategory(ci: number) {
    const cat = body.categories[ci];
    if (!cat) return;
    const pointing = cat.key ? refs.categories.get(cat.key) : undefined;
    if (pointing?.length) {
      setWarning(
        `"${cat.name}" cannot be deleted yet: ${pointing.length} answer${pointing.length === 1 ? "" : "s"} jump to this category (${pointing.slice(0, 3).join(", ")}).`,
      );
      return;
    }
    if (cat.questions.length > 0) {
      setWarning(
        `"${cat.name}" still holds ${cat.questions.length} question${cat.questions.length === 1 ? "" : "s"}. Delete those first, so a category never takes its questions with it by accident.`,
      );
      return;
    }
    setWarning(null);
    setCategories(renumber(removeAt(body.categories, ci)));
  }

  const totalQuestions = body.categories.reduce((n, c) => n + c.questions.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-[var(--muted-foreground)]">
          {body.categories.length} categor{body.categories.length === 1 ? "y" : "ies"}, {totalQuestions} question
          {totalQuestions === 1 ? "" : "s"}. Open a category to edit its questions.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            const next = [...body.categories, blankCategory(body.categories.length)];
            setCategories(next);
            setOpen(next[next.length - 1]?.key ?? null);
          }}
        >
          + Add category
        </Button>
      </div>

      {warning ? (
        <p className="rounded-md border border-yellow-600/40 bg-yellow-600/5 p-3 text-sm">{warning}</p>
      ) : null}

      {body.categories.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-[var(--muted-foreground)]">
          No categories yet. A template with no questions is a gate-only funnel, which is a real shape, so
          this is not an error.
        </p>
      ) : null}

      {body.categories.map((cat, ci) => {
        const id = cat.key ?? `idx_${ci}`;
        const isOpen = open === id;
        return (
          <div key={id} className="rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setOpen(isOpen ? null : id)}
              >
                <span className="text-sm text-[var(--muted-foreground)]">{isOpen ? "▾" : "▸"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {cat.name || "Untitled category"}
                  </span>
                  <span className="block text-xs text-[var(--muted-foreground)]">
                    {cat.questions.length} question{cat.questions.length === 1 ? "" : "s"}
                    {(cat.page ?? 1) === 2 ? " · page 2 (queries)" : ""}
                  </span>
                </span>
              </button>
              <RowControls
                index={ci}
                count={body.categories.length}
                disabled={disabled}
                onMove={(from, to) => setCategories(renumber(move(body.categories, from, to)))}
                onRemove={() => removeCategory(ci)}
                removeLabel="Delete category"
              />
            </div>

            {isOpen ? (
              <div className="flex flex-col gap-4 border-t p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Category name">
                    <Input
                      value={cat.name}
                      disabled={disabled}
                      onChange={(e) => patchCategory(ci, { name: e.target.value })}
                      placeholder="e.g. Readiness"
                    />
                  </Field>
                  <Field label="Shown on" hint="Page 2 is the separate scored queries page.">
                    <select
                      className={SELECT_CLASS}
                      value={String(cat.page ?? 1)}
                      disabled={disabled}
                      onChange={(e) => patchCategory(ci, { page: Number(e.target.value) })}
                    >
                      <option value="1">Page 1 - the assessment</option>
                      <option value="2">Page 2 - queries</option>
                    </select>
                  </Field>
                </div>
                <Field label="Description" hint="Optional. Shown above the category's questions.">
                  <Textarea
                    rows={2}
                    value={cat.description ?? ""}
                    disabled={disabled}
                    onChange={(e) => patchCategory(ci, { description: e.target.value })}
                  />
                </Field>

                {cat.questions.map((q, qi) => (
                  <div key={q.key ?? `q_${qi}`} className="flex flex-col gap-3 rounded-md border bg-[var(--muted)]/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--muted-foreground)]">
                        Question {qi + 1}
                      </span>
                      <RowControls
                        index={qi}
                        count={cat.questions.length}
                        disabled={disabled}
                        onMove={(from, to) =>
                          patchCategory(ci, { questions: renumber(move(cat.questions, from, to)) })
                        }
                        onRemove={() => removeQuestion(ci, qi)}
                      />
                    </div>

                    <Field label="Question text">
                      <Textarea
                        rows={2}
                        value={q.text}
                        disabled={disabled}
                        onChange={(e) => patchQuestion(ci, qi, { text: e.target.value })}
                      />
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Answer type">
                        <select
                          className={SELECT_CLASS}
                          value={q.type}
                          disabled={disabled}
                          onChange={(e) => {
                            const type = e.target.value as QuestionExport["type"];
                            // A choice question needs two options to be valid, and a
                            // free-text one must have none: switching type without this
                            // writes a document the save would refuse.
                            patchQuestion(ci, qi, {
                              type,
                              options:
                                type === "FREE_TEXT"
                                  ? []
                                  : q.options.length >= 2
                                    ? q.options
                                    : [
                                        { label: "", value: 0, displayOrder: 0 },
                                        { label: "", value: 1, displayOrder: 1 },
                                      ],
                            });
                          }}
                        >
                          <option value="SINGLE_SELECT">Pick one (scored)</option>
                          <option value="FREE_TEXT">Typed answer (not scored)</option>
                        </select>
                      </Field>
                      <Field label="Weight" hint="How much this question counts.">
                        <Input
                          type="number"
                          min={0}
                          step="0.1"
                          value={q.weight}
                          disabled={disabled}
                          onChange={(e) => patchQuestion(ci, qi, { weight: Number(e.target.value) })}
                        />
                      </Field>
                      <Field label="Answer needed">
                        <label className="flex h-10 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={q.required}
                            disabled={disabled}
                            onChange={(e) => patchQuestion(ci, qi, { required: e.target.checked })}
                          />
                          Required
                        </label>
                      </Field>
                    </div>

                    {clinic ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Funnel role" hint="Clinic audit only. Blank = not scored.">
                          <Input
                            value={q.scoringRole ?? ""}
                            disabled={disabled}
                            onChange={(e) => patchQuestion(ci, qi, { scoringRole: e.target.value })}
                          />
                        </Field>
                        <Field label="Unit" hint="PER_10 / PER_100 / RUPEES / COUNT / POINTS.">
                          <Input
                            value={q.scoringUnit ?? ""}
                            disabled={disabled}
                            onChange={(e) => patchQuestion(ci, qi, { scoringUnit: e.target.value })}
                          />
                        </Field>
                      </div>
                    ) : null}

                    {q.type === "SINGLE_SELECT" ? (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-[var(--muted-foreground)]">
                          Answers {clinic ? "and their figures" : "and their scores"}
                        </span>
                        {q.options.map((o, oi) => (
                          <div key={oi} className="flex flex-wrap items-start gap-2">
                            <Input
                              className="min-w-[12rem] flex-1"
                              placeholder="Answer label"
                              value={o.label}
                              disabled={disabled}
                              onChange={(e) => patchOption(ci, qi, oi, { label: e.target.value })}
                            />
                            <Input
                              className="w-24"
                              type="number"
                              value={o.value}
                              disabled={disabled}
                              onChange={(e) => patchOption(ci, qi, oi, { value: Number(e.target.value) })}
                            />
                            {o.route ? (
                              <span
                                className="flex h-9 items-center rounded-md border px-2 text-xs text-[var(--muted-foreground)]"
                                title="This answer carries a routing rule. It is kept as it is; routing is edited in the funnel builder."
                              >
                                routes
                              </span>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              disabled={disabled || q.options.length <= 2}
                              onClick={() =>
                                patchQuestion(ci, qi, { options: renumber(removeAt(q.options, oi)) })
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        <div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={disabled || q.options.length >= 10}
                            onClick={() =>
                              patchQuestion(ci, qi, {
                                options: [
                                  ...q.options,
                                  { label: "", value: 0, displayOrder: q.options.length },
                                ],
                              })
                            }
                          >
                            + Add answer
                          </Button>
                        </div>
                        {q.options.length <= 2 ? (
                          <p className="text-xs text-[var(--muted-foreground)]">
                            A question that is picked from needs at least two answers, so the last two cannot
                            be removed.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {q.defaultRoute ? (
                      <p className="text-xs text-[var(--muted-foreground)]">
                        This question carries a routing rule, kept exactly as it is. Branching is edited in a
                        funnel built from this template, not in the template.
                      </p>
                    ) : null}
                  </div>
                ))}

                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      patchCategory(ci, {
                        questions: [...cat.questions, blankQuestion(cat.questions.length)],
                      })
                    }
                  >
                    + Add question to {cat.name || "this category"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
