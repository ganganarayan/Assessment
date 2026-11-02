"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentBodyExport } from "@/features/assessment/transfer/schema";
import {
  EMPTY_DISQUALIFIED,
  EMPTY_QUALIFICATION,
  UNNAMED_EXIT,
  WAITLIST_EXIT_KEY,
  disqualifiedContentSchema,
  isWaitlistExitKey,
  makeWaitlistExit,
  optionOutcome,
  qualificationSchema,
  type DisqualifiedContentInput,
  type GateOutcome,
  type QualOptionInput,
  type QualQuestionInput,
  type QualificationInput,
} from "@/features/assessment/schemas";
import {
  Field,
  RowControls,
  SELECT_CLASS,
  move,
  newKey,
  removeAt,
  replaceAt,
} from "@/features/templates/components/template-editor-shared";

/**
 * The qualification gate and the pages it turns people away to, edited on the template.
 *
 * READ WITH THE FUNNEL'S OWN SCHEMAS. `qualification` and `disqualifiedContent` are
 * opaque blobs in the transfer shape, and this editor parses them with exactly the
 * schemas the public funnel, the scorer and the live builder parse them with. So what
 * is shown here is what the funnel would do, and a key those schemas do not know is a
 * key nothing in the app reads anyway.
 *
 * ONE DROPDOWN PER ANSWER, never a tick beside a key. Disqualified and waitlisted are
 * mutually exclusive by construction - there is one outcome per answer - and the stored
 * pair (`disqualifies` + `exitKey`) is derived from it rather than edited directly. Two
 * fields that must agree eventually disagree, and the one that loses that argument
 * decides who gets turned away.
 *
 * 🔴 EXIT KEYS, NEVER EXIT NAMES. An answer points at an exit by its key, so renaming
 * an exit re-labels one screen and re-routes nothing.
 */

const OUTCOMES: { value: GateOutcome; label: string; hint: string }[] = [
  { value: "NONE", label: "Carry on", hint: "This answer is fine. Scored if you give it points." },
  { value: "DISQUALIFY", label: "Turn away", hint: "Sent to an exit page. Never becomes a lead." },
  { value: "WAITLIST", label: "Waitlist", hint: "A fit whose timing is wrong. Opts in, never excluded from ads." },
];

/** Read the gate, falling back to an empty one rather than losing the editor to a blob
 *  this app cannot parse. */
function readGate(value: unknown): QualificationInput {
  const p = qualificationSchema.safeParse(value ?? undefined);
  return p.success ? p.data : { ...EMPTY_QUALIFICATION };
}

function readExitPages(value: unknown): DisqualifiedContentInput {
  const p = disqualifiedContentSchema.safeParse(value ?? undefined);
  return p.success ? p.data : { ...EMPTY_DISQUALIFIED };
}

export function TemplateGateEditor({
  body,
  onChange,
  section,
  disabled = false,
}: {
  body: AssessmentBodyExport;
  onChange: (next: AssessmentBodyExport) => void;
  /** "gate" = the questions and the score bands. "exit" = the pages. Two steps of the
   *  builder, because deciding who gets in and writing what a rejected person reads are
   *  two different jobs. */
  section: "gate" | "exit";
  disabled?: boolean;
}) {
  const gate = readGate(body.qualification);
  const pages = readExitPages(body.disqualifiedContent);
  const exits = pages.exits;

  const writeGate = (next: QualificationInput) => onChange({ ...body, qualification: next });

  /**
   * Write the exit pages back, keeping exit one mirrored onto the five legacy top-level
   * fields - the same thing the server does on every save. A template whose exits array
   * and legacy fields disagree renders the default copy on an older deploy.
   */
  const writePages = (next: DisqualifiedContentInput) => {
    const first = next.exits[0];
    onChange({
      ...body,
      disqualifiedContent: {
        ...next,
        heading: first?.heading ?? next.heading,
        subtext: first?.subtext ?? next.subtext,
        bodyHtml: first?.bodyHtml ?? next.bodyHtml,
        buttonLabel: first?.buttonLabel ?? next.buttonLabel,
        buttonUrl: first?.buttonUrl ?? next.buttonUrl,
      },
    });
  };

  if (section === "exit") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            {exits.length === 0
              ? "No exit pages yet. Add one and the gate has somewhere to send the people it turns away."
              : `${exits.length} exit page${exits.length === 1 ? "" : "s"}. The first one is where any answer with no route of its own lands.`}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || exits.length >= 20}
            onClick={() =>
              writePages({
                ...pages,
                exits: [
                  ...exits,
                  {
                    key: newKey("exit"),
                    name: "",
                    mode: "PAGE",
                    heading: "",
                    subtext: "",
                    bodyHtml: "",
                    buttonLabel: "",
                    buttonUrl: "",
                    fireDisqualifiedEvent: true,
                    eventName: "",
                    contentCategory: "",
                    completionEventName: "",
                    neverExclude: false,
                  },
                ],
              })
            }
          >
            + Add exit page
          </Button>
        </div>

        {exits.map((exit, i) => {
          const reserved = isWaitlistExitKey(exit.key);
          const usedBy = gate.questions.reduce(
            (n, q) => n + q.options.filter((o) => (o.exitKey || "") === exit.key && o.disqualifies).length,
            0,
          );
          return (
            <div key={exit.key} className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {exit.name.trim() || `${UNNAMED_EXIT} ${i + 1}`}
                  {reserved ? " · reserved waitlist route" : ""}
                </span>
                <RowControls
                  index={i}
                  count={exits.length}
                  disabled={disabled}
                  onMove={(from, to) => writePages({ ...pages, exits: move(exits, from, to) })}
                  onRemove={() => writePages({ ...pages, exits: removeAt(exits, i) })}
                  removeLabel="Delete page"
                />
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                {usedBy === 0
                  ? "No answer routes here yet."
                  : `${usedBy} answer${usedBy === 1 ? "" : "s"} route here.`}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" hint="Yours, for the dropdown on an answer. Never shown to anybody.">
                  <Input
                    value={exit.name}
                    disabled={disabled}
                    onChange={(e) =>
                      writePages({ ...pages, exits: replaceAt(exits, i, { ...exit, name: e.target.value }) })
                    }
                  />
                </Field>
                <Field
                  label="What happens here"
                  hint="Page = they read it and stop. Opt-in = they still leave their details. Continue = they take the assessment anyway."
                >
                  <select
                    className={SELECT_CLASS}
                    value={exit.mode}
                    disabled={disabled}
                    onChange={(e) =>
                      writePages({
                        ...pages,
                        exits: replaceAt(exits, i, { ...exit, mode: e.target.value as typeof exit.mode }),
                      })
                    }
                  >
                    <option value="PAGE">Page - they read it and stop</option>
                    <option value="OPTIN">Opt-in - they still leave their details</option>
                    <option value="CONTINUE">Continue - they take the assessment anyway</option>
                  </select>
                </Field>
              </div>

              <Field label="Heading">
                <Input
                  value={exit.heading}
                  disabled={disabled}
                  onChange={(e) =>
                    writePages({ ...pages, exits: replaceAt(exits, i, { ...exit, heading: e.target.value }) })
                  }
                />
              </Field>
              <Field label="Subtext">
                <Textarea
                  rows={2}
                  value={exit.subtext}
                  disabled={disabled}
                  onChange={(e) =>
                    writePages({ ...pages, exits: replaceAt(exits, i, { ...exit, subtext: e.target.value }) })
                  }
                />
              </Field>
              <Field label="Body" hint="Optional longer copy.">
                <Textarea
                  rows={4}
                  value={exit.bodyHtml}
                  disabled={disabled}
                  onChange={(e) =>
                    writePages({ ...pages, exits: replaceAt(exits, i, { ...exit, bodyHtml: e.target.value }) })
                  }
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Button label" hint="Blank = no button.">
                  <Input
                    value={exit.buttonLabel}
                    disabled={disabled}
                    onChange={(e) =>
                      writePages({ ...pages, exits: replaceAt(exits, i, { ...exit, buttonLabel: e.target.value }) })
                    }
                  />
                </Field>
                <Field label="Button link">
                  <Input
                    value={exit.buttonUrl}
                    disabled={disabled}
                    onChange={(e) =>
                      writePages({ ...pages, exits: replaceAt(exits, i, { ...exit, buttonUrl: e.target.value }) })
                    }
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-3 border-t pt-3">
                <p className="text-xs font-medium text-[var(--muted-foreground)]">What Meta is told</p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={exit.fireDisqualifiedEvent}
                    disabled={disabled}
                    onChange={(e) =>
                      writePages({
                        ...pages,
                        exits: replaceAt(exits, i, { ...exit, fireDisqualifiedEvent: e.target.checked }),
                      })
                    }
                  />
                  Report this exit to the ad account
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Event name" hint="Blank = GateDisqualified.">
                    <Input
                      value={exit.eventName}
                      disabled={disabled}
                      onChange={(e) =>
                        writePages({ ...pages, exits: replaceAt(exits, i, { ...exit, eventName: e.target.value }) })
                      }
                    />
                  </Field>
                  <Field label="Content category" hint='Rides along on the event, e.g. "not_yet".'>
                    <Input
                      value={exit.contentCategory}
                      disabled={disabled}
                      onChange={(e) =>
                        writePages({
                          ...pages,
                          exits: replaceAt(exits, i, { ...exit, contentCategory: e.target.value }),
                        })
                      }
                    />
                  </Field>
                </div>
                {exit.mode === "CONTINUE" ? (
                  <Field
                    label="Completion event for these people"
                    hint="Blank = the funnel's normal completion event, which teaches the ad account to find more people like them."
                  >
                    <Input
                      value={exit.completionEventName}
                      disabled={disabled}
                      onChange={(e) =>
                        writePages({
                          ...pages,
                          exits: replaceAt(exits, i, { ...exit, completionEventName: e.target.value }),
                        })
                      }
                    />
                  </Field>
                ) : null}
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={exit.neverExclude}
                    disabled={disabled || reserved}
                    onChange={(e) =>
                      writePages({ ...pages, exits: replaceAt(exits, i, { ...exit, neverExclude: e.target.checked }) })
                    }
                  />
                  <span>
                    <span className="font-medium">Never put these people in an exclusion audience</span>
                    <span className="block text-xs text-[var(--muted-foreground)]">
                      For a route that is not a rejection. With this on, GateDisqualified is refused for this
                      exit even if it is typed in by hand. Always on for the waitlist.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ---------------------------- the gate itself ---------------------------- */

  function setQuestion(qi: number, patch: Partial<QualQuestionInput>) {
    const q = gate.questions[qi];
    if (!q) return;
    writeGate({ ...gate, questions: replaceAt(gate.questions, qi, { ...q, ...patch }) });
  }

  /**
   * Set an answer's outcome, and make sure the route it needs exists.
   *
   * Choosing Waitlist on an answer has to be able to create the reserved waitlist route
   * if the template does not carry one yet, or the answer would point at a key that
   * resolves to nothing and fall through to the rejection page - which is the exact
   * mistake this one dropdown exists to prevent.
   */
  function setOutcome(qi: number, oi: number, outcome: GateOutcome) {
    const q = gate.questions[qi];
    const o = q?.options[oi];
    if (!q || !o) return;

    let nextOption: QualOptionInput;
    if (outcome === "NONE") nextOption = { ...o, disqualifies: false, exitKey: "" };
    else if (outcome === "WAITLIST") nextOption = { ...o, disqualifies: true, exitKey: WAITLIST_EXIT_KEY };
    else {
      // Turn away: keep whatever named route was already chosen, unless it was the
      // waitlist, which is not a rejection route.
      const keep = isWaitlistExitKey(o.exitKey) ? "" : (o.exitKey ?? "");
      nextOption = { ...o, disqualifies: true, exitKey: keep };
    }

    const nextGate: QualificationInput = {
      ...gate,
      questions: replaceAt(gate.questions, qi, { ...q, options: replaceAt(q.options, oi, nextOption) }),
    };

    if (outcome === "WAITLIST" && !exits.some((e) => isWaitlistExitKey(e.key))) {
      // Both halves in one change, so a save between them cannot leave a dangling key.
      const nextPages = { ...pages, exits: [...exits, makeWaitlistExit()] };
      const first = nextPages.exits[0];
      onChange({
        ...body,
        qualification: nextGate,
        disqualifiedContent: {
          ...nextPages,
          heading: first?.heading ?? nextPages.heading,
          subtext: first?.subtext ?? nextPages.subtext,
          bodyHtml: first?.bodyHtml ?? nextPages.bodyHtml,
          buttonLabel: first?.buttonLabel ?? nextPages.buttonLabel,
          buttonUrl: first?.buttonUrl ?? nextPages.buttonUrl,
        },
      });
      return;
    }
    writeGate(nextGate);
  }

  const namedExits = exits.filter((e) => !isWaitlistExitKey(e.key));

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={gate.enabled}
          disabled={disabled}
          onChange={(e) => writeGate({ ...gate, enabled: e.target.checked })}
        />
        <span>
          <span className="font-medium">The gate is on</span>
          <span className="block text-xs text-[var(--muted-foreground)]">
            Off means every question below is stored and ignored: a funnel built from this template would
            let everybody through.
          </span>
        </span>
      </label>

      {gate.enabled && gate.questions.length === 0 ? (
        <p className="rounded-md border border-yellow-600/40 bg-yellow-600/5 p-3 text-sm">
          🟡 The gate is on and has no questions, so it does nothing. Add one, or switch it off.
        </p>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-[var(--muted-foreground)]">
          {gate.questions.length} gate question{gate.questions.length === 1 ? "" : "s"}, asked one at a time
          before anything else.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || gate.questions.length >= 20}
          onClick={() =>
            writeGate({
              ...gate,
              questions: [
                ...gate.questions,
                {
                  id: newKey("gq"),
                  text: "",
                  type: "choice",
                  placeholder: "",
                  required: false,
                  options: [
                    { id: newKey("go"), label: "", disqualifies: false, points: 0, exitKey: "" },
                    { id: newKey("go"), label: "", disqualifies: false, points: 0, exitKey: "" },
                  ],
                },
              ],
            })
          }
        >
          + Add gate question
        </Button>
      </div>

      {gate.questions.map((q, qi) => (
        <div key={q.id} className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--muted-foreground)]">Gate question {qi + 1}</span>
            <RowControls
              index={qi}
              count={gate.questions.length}
              disabled={disabled}
              onMove={(from, to) => writeGate({ ...gate, questions: move(gate.questions, from, to) })}
              onRemove={() => writeGate({ ...gate, questions: removeAt(gate.questions, qi) })}
            />
          </div>

          <Field label="Question">
            <Textarea
              rows={2}
              value={q.text}
              disabled={disabled}
              onChange={(e) => setQuestion(qi, { text: e.target.value })}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Answer type" hint="A typed answer never turns anybody away - you read it later.">
              <select
                className={SELECT_CLASS}
                value={q.type}
                disabled={disabled}
                onChange={(e) => {
                  const type = e.target.value as QualQuestionInput["type"];
                  setQuestion(qi, {
                    type,
                    options:
                      type === "text"
                        ? []
                        : q.options.length >= 2
                          ? q.options
                          : [
                              { id: newKey("go"), label: "", disqualifies: false, points: 0, exitKey: "" },
                              { id: newKey("go"), label: "", disqualifies: false, points: 0, exitKey: "" },
                            ],
                  });
                }}
              >
                <option value="choice">Pick one</option>
                <option value="text">Typed answer (you read it)</option>
              </select>
            </Field>
            <Field label="Answer needed">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={q.required}
                  disabled={disabled}
                  onChange={(e) => setQuestion(qi, { required: e.target.checked })}
                />
                Required
              </label>
            </Field>
          </div>

          {q.type === "text" ? (
            <Field label="Placeholder">
              <Input
                value={q.placeholder}
                disabled={disabled}
                onChange={(e) => setQuestion(qi, { placeholder: e.target.value })}
              />
            </Field>
          ) : (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Answers</span>
              {q.options.map((o, oi) => {
                const outcome = optionOutcome(o);
                return (
                  <div key={o.id} className="flex flex-col gap-2 rounded-md border bg-[var(--muted)]/20 p-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <Input
                        className="min-w-[12rem] flex-1"
                        placeholder="Answer label"
                        value={o.label}
                        disabled={disabled}
                        onChange={(e) =>
                          setQuestion(qi, {
                            options: replaceAt(q.options, oi, { ...o, label: e.target.value }),
                          })
                        }
                      />
                      <Input
                        className="w-20"
                        type="number"
                        title="Points this answer adds to the gate score"
                        value={o.points}
                        disabled={disabled}
                        onChange={(e) =>
                          setQuestion(qi, {
                            options: replaceAt(q.options, oi, { ...o, points: Number(e.target.value) }),
                          })
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        disabled={disabled || q.options.length <= 2}
                        onClick={() => setQuestion(qi, { options: removeAt(q.options, oi) })}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="This answer means" hint={OUTCOMES.find((x) => x.value === outcome)?.hint}>
                        <select
                          className={SELECT_CLASS}
                          value={outcome}
                          disabled={disabled}
                          onChange={(e) => setOutcome(qi, oi, e.target.value as GateOutcome)}
                        >
                          {OUTCOMES.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {outcome === "DISQUALIFY" ? (
                        <Field label="Sent to" hint="Blank = the first exit page.">
                          <select
                            className={SELECT_CLASS}
                            value={o.exitKey ?? ""}
                            disabled={disabled}
                            onChange={(e) =>
                              setQuestion(qi, {
                                options: replaceAt(q.options, oi, { ...o, exitKey: e.target.value }),
                              })
                            }
                          >
                            <option value="">First exit page</option>
                            {namedExits.map((e2, ei) => (
                              <option key={e2.key} value={e2.key}>
                                {e2.name.trim() || `${UNNAMED_EXIT} ${ei + 1}`}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled || q.options.length >= 20}
                  onClick={() =>
                    setQuestion(qi, {
                      options: [
                        ...q.options,
                        { id: newKey("go"), label: "", disqualifies: false, points: 0, exitKey: "" },
                      ],
                    })
                  }
                >
                  + Add answer
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={gate.bands.enabled}
            disabled={disabled}
            onChange={(e) => writeGate({ ...gate, bands: { ...gate.bands, enabled: e.target.checked } })}
          />
          <span>
            <span className="font-medium">Decide by the gate total as well as by single answers</span>
            <span className="block text-xs text-[var(--muted-foreground)]">
              Off means only a turn-away answer stops anybody. On, the points above add up and the total
              decides, so one weak answer is survivable.
            </span>
          </span>
        </label>
        {gate.bands.enabled ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Through at or above" hint="Points.">
              <Input
                type="number"
                value={gate.bands.passMin}
                disabled={disabled}
                onChange={(e) =>
                  writeGate({ ...gate, bands: { ...gate.bands, passMin: Number(e.target.value) } })
                }
              />
            </Field>
            <Field label="Review at or above" hint="Through, but flagged for you to read.">
              <Input
                type="number"
                value={gate.bands.reviewMin}
                disabled={disabled}
                onChange={(e) =>
                  writeGate({ ...gate, bands: { ...gate.bands, reviewMin: Number(e.target.value) } })
                }
              />
            </Field>
            <Field label="Below that, send to">
              <select
                className={SELECT_CLASS}
                value={gate.bands.belowExitKey ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  writeGate({ ...gate, bands: { ...gate.bands, belowExitKey: e.target.value } })
                }
              >
                <option value="">First exit page</option>
                {exits.map((e2, ei) => (
                  <option key={e2.key} value={e2.key}>
                    {e2.name.trim() || `${UNNAMED_EXIT} ${ei + 1}`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}
      </div>
    </div>
  );
}
