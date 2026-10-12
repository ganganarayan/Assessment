"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveQualification,
  saveDisqualifiedContent,
  ensureGateExit,
} from "@/features/assessment/actions/qualification";
import {
  exitLabel,
  readExits,
  type QualificationInput,
  type DisqualifiedContentInput,
  type GateExitInput,
} from "@/features/assessment/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * A saved-state message with a TONE.
 *
 * 🔴 Both outcomes used to render as the same muted-grey span, so "The qualification
 * gate is available on the Growth plan and up." looked exactly like "Qualification
 * saved." A refused save read as a successful one, and the owner went looking for the
 * bug in the funnel.
 */
type Msg = { tone: "ok" | "warn" | "error"; text: string };

const MSG_CLASS: Record<Msg["tone"], string> = {
  ok: "text-sm font-medium text-green-600",
  warn: "text-sm font-medium text-yellow-600",
  error: "text-sm font-medium text-red-500",
};

export function QualificationManager({
  assessmentId,
  initialQualification,
  initialDisqualified,
  storedUnreadable = false,
  section = "both",
  canRoute = true,
  canBands = true,
}: {
  assessmentId: string;
  initialQualification: QualificationInput;
  initialDisqualified: DisqualifiedContentInput;
  /**
   * The row holds a qualification config this app cannot read (an import, or a shape
   * from an older version). The editor below is therefore EMPTY while the stored
   * config is not, the funnel ignores the stored one, and saving would overwrite it.
   * Silently showing an empty editor is how that becomes "the gate just vanished".
   */
  storedUnreadable?: boolean;
  /**
   * Which half to render. The gate and the page shown to someone it turns away are
   * two different jobs - one decides who gets in, the other is the last thing a
   * rejected person ever sees - and they are now two steps of the builder. "both"
   * keeps any caller that has not been split.
   */
  section?: "gate" | "exit" | "both";
  /**
   * What this workspace's plan allows, resolved on the server.
   *
   * 🔴 These DISABLE the controls rather than letting the save refuse them. A paywall
   * discovered after the work is done - type the route name, tab away, watch it vanish -
   * charges for effort already spent and teaches the owner the builder is unreliable.
   * The server check stays exactly where it was, because a disabled input is a courtesy
   * and not a boundary; this only decides where the person finds out.
   */
  canRoute?: boolean;
  canBands?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState<QualificationInput>(initialQualification);
  const [d, setD] = useState<DisqualifiedContentInput>(initialDisqualified);
  /**
   * 🔴 The two halves of this builder are two INSTANCES of this component (section
   * "gate" and section "exit"), each holding its own copy of the exit content. Naming
   * a route on an answer writes it on the server, so without this the exit step would
   * not know the route existed until a full page reload - and saving that stale copy
   * would delete the route that had just been made.
   *
   * So: when the server sends a different exit content than last time (a refresh after
   * any save), adopt it. Keyed on the serialized prop, so ordinary typing is untouched.
   */
  const [seenDisq, setSeenDisq] = useState(() => JSON.stringify(initialDisqualified));
  const incomingDisq = JSON.stringify(initialDisqualified);
  if (incomingDisq !== seenDisq) {
    setSeenDisq(incomingDisq);
    setD(initialDisqualified);
  }

  const [qMsg, setQMsg] = useState<Msg | null>(null);
  const [dMsg, setDMsg] = useState<Msg | null>(null);
  const [pending, start] = useTransition();

  /**
   * Adding the FIRST gate question turns the gate on.
   *
   * 🔴 The failure this prevents: questions written, saved, confirmed - and every
   * respondent skipping them, because a separate checkbox above the list was never
   * ticked. Nothing distinguished "saved" from "saved and live", so the funnel looked
   * broken while the data was exactly as entered. Adding a gate question is the
   * clearest statement there is that the gate is wanted, so the switch follows the
   * questions. Turning it OFF stays deliberate, and keeps the questions.
   */
  const addedQuestion = (s: QualificationInput, question: QualificationInput["questions"][number]) => ({
    ...s,
    enabled: s.questions.length === 0 ? true : s.enabled,
    questions: [...s.questions, question],
  });
  // ---- qualification editing helpers ----
  const addQuestion = () =>
    setQ((s) => addedQuestion(s, {
      id: uid(), text: "", type: "choice", placeholder: "", required: false,
      options: [
        { id: uid(), label: "", disqualifies: false, points: 0, exitKey: "" },
        { id: uid(), label: "", disqualifies: false, points: 0, exitKey: "" },
      ],
    }));
  const addTextQuestion = () =>
    setQ((s) => addedQuestion(s, {
      id: uid(), text: "", type: "text", placeholder: "", required: false, options: [],
    }));
  const removeQuestion = (qi: number) =>
    setQ((s) => ({ ...s, questions: s.questions.filter((_, i) => i !== qi) }));
  const setQuestionText = (qi: number, text: string) =>
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, text } : x)) }));
  const patchQuestion = (qi: number, patch: Partial<{ placeholder: string; required: boolean }>) =>
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, ...patch } : x)) }));
  const addOption = (qi: number) =>
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, options: [...x.options, { id: uid(), label: "", disqualifies: false, points: 0, exitKey: "" }] } : x)) }));
  const removeOption = (qi: number, oi: number) =>
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, options: x.options.filter((_, j) => j !== oi) } : x)) }));
  const setOption = (qi: number, oi: number, patch: Partial<{ label: string; disqualifies: boolean; points: number; exitKey: string }>) =>
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, options: x.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : x)) }));

  /**
   * The confirmation says what the FUNNEL will do, not that a row was written.
   * "Qualification saved." was true of a gate that respondents would never see, which
   * is the one case where the owner needs to be told something.
   */
  const saveQual = () =>
    start(async () => {
      setQMsg(null);
      const res = await saveQualification(assessmentId, q);
      if (!res.ok) {
        setQMsg({ tone: "error", text: res.error });
        return;
      }
      const n = res.data?.questionCount ?? q.questions.length;
      const plural = n === 1 ? "question" : "questions";
      setQMsg(
        res.data?.live
          ? { tone: "ok", text: `Saved and live. Respondents answer ${n} ${plural} before anything else.` }
          : {
              tone: "warn",
              text: n === 0
                ? "Saved. There are no gate questions, so nothing is asked before the assessment."
                : `Saved, but the gate is OFF - respondents skip all ${n} ${plural}. Tick "Enable qualification gate" to show them.`,
            },
      );
      router.refresh();
    });
  const saveDisq = () =>
    start(async () => {
      setDMsg(null);
      // Send the MATERIALIZED list, never the raw state: a legacy gate's state carries
      // `exits: []` until something is edited, and saving that over routes created from
      // the answers screen would delete them.
      const res = await saveDisqualifiedContent(assessmentId, { ...d, exits });
      setDMsg(res.ok ? { tone: "ok", text: "Saved." } : { tone: "error", text: res.error });
      if (res.ok) router.refresh();
    });

  // The exit routes, normalized: a gate built before routes existed reads back as one
  // unnamed exit holding the content it already has.
  const exits: GateExitInput[] = d.exits.length > 0 ? d.exits : readExits(d);
  const exitNameOf = (key: string): string => {
    const i = exits.findIndex((e) => e.key === key);
    return i >= 0 ? exits[i]?.name ?? "" : "";
  };
  const setExit = (key: string, patch: Partial<GateExitInput>) =>
    setD((s) => ({ ...s, exits: (s.exits.length > 0 ? s.exits : readExits(s)).map((e) => (e.key === key ? { ...e, ...patch } : e)) }));
  const removeExit = (key: string) =>
    setD((s) => ({ ...s, exits: (s.exits.length > 0 ? s.exits : readExits(s)).filter((e) => e.key !== key) }));

  /**
   * Commit a name typed next to "Disqualifies".
   *
   * The name IS the interface here - the owner types "Waitlist" on an answer and a
   * route called Waitlist appears in the exit list below. What is stored on the answer
   * is the route's key, so renaming it later moves nothing.
   *
   * Committed on blur rather than on every keystroke, or typing "Waitlist" would leave
   * behind routes called W, Wa and Wai. The server appends rather than replaces, so a
   * name typed here cannot clobber an exit being edited in the other half.
   */
  const commitExitName = (qi: number, oi: number, typed: string) =>
    start(async () => {
      const clean = typed.trim();
      if (!clean) {
        setOption(qi, oi, { exitKey: "" });
        return;
      }
      const local = exits.find((e) => e.name.trim().toLowerCase() === clean.toLowerCase());
      if (local) {
        setOption(qi, oi, { exitKey: local.key });
        return;
      }
      const res = await ensureGateExit(assessmentId, clean);
      if (!res.ok) {
        setQMsg({ tone: "error", text: res.error });
        return;
      }
      const key = res.data?.key ?? "";
      // Adopt it locally as well, so the field shows the name back instead of going
      // blank while it waits for the server render.
      setD((prev) => {
        const list = prev.exits.length > 0 ? prev.exits : readExits(prev);
        if (list.some((e) => e.key === key)) {
          return { ...prev, exits: list.map((e) => (e.key === key ? { ...e, name: clean } : e)) };
        }
        return {
          ...prev,
          exits: [
            ...list,
            {
              key,
              name: clean,
              mode: "PAGE" as const,
              heading: "",
              subtext: "",
              bodyHtml: "",
              buttonLabel: "",
              buttonUrl: "",
              fireDisqualifiedEvent: true,
              eventName: "",
              contentCategory: "",
              completionEventName: "",
            },
          ],
        };
      });
      setOption(qi, oi, { exitKey: key });
      setQMsg({ tone: "warn", text: `Exit "${clean}" created. Write what it says in the exit step, then save the gate.` });
      router.refresh();
    });

  // Standing state of the gate, independent of any save: questions that exist but are
  // switched off are invisible to every respondent, and nothing used to say so.
  const inert = !q.enabled && q.questions.length > 0;

  const showGate = section !== "exit";
  const showExit = section !== "gate";

  return (
    <div className="flex flex-col gap-6">
      {showGate ? (
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={q.enabled} onChange={(e) => setQ((s) => ({ ...s, enabled: e.target.checked }))} />
          Enable qualification gate (Page 1, shown before the assessment)
        </label>
        <p className="text-xs text-[var(--muted-foreground)]">
          Questions show one at a time and auto-advance. Tick <strong>Disqualifies</strong> on any answer
          that should send the person to the disqualified page instead of the assessment. No lead,
          submission or result is created for a disqualified person. A gate works on its own: an
          assessment with no scored questions is a perfectly good screening funnel.
        </p>
        {storedUnreadable ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
            🔴 This assessment has a saved qualification config that could not be read, so the
            editor below is empty and the funnel is ignoring it. Rebuild the questions here and
            save to replace it.
          </p>
        ) : null}
        {inert ? (
          <p className="rounded-md border border-yellow-600/40 bg-yellow-600/10 px-3 py-2 text-xs font-medium text-yellow-700 dark:text-yellow-500">
            🟡 These {q.questions.length === 1 ? "question is" : "questions are"} saved but the gate is
            OFF, so respondents never see {q.questions.length === 1 ? "it" : "them"} - the funnel starts at
            the opt-in. Tick the box above and save to put the gate live.
          </p>
        ) : null}

        {q.questions.map((question, qi) => (
          <div key={question.id} className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-[var(--muted-foreground)]">
                Q{qi + 1} · {question.type === "text" ? "text" : "choice"}
              </span>
              <Input
                value={question.text}
                placeholder={question.type === "text" ? "In one line, what does the business do?" : "Which describes you?"}
                onChange={(e) => setQuestionText(qi, e.target.value)}
              />
              <Button size="sm" variant="ghost" onClick={() => removeQuestion(qi)}>✕</Button>
            </div>
            {question.type === "text" ? (
              <div className="flex flex-col gap-2 pl-6">
                <Input
                  value={question.placeholder}
                  placeholder="Placeholder (e.g. We manufacture industrial valves for oil & gas.)"
                  onChange={(e) => patchQuestion(qi, { placeholder: e.target.value })}
                />
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(e) => patchQuestion(qi, { required: e.target.checked })}
                  />
                  Required
                </label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Free text for your <strong>manual review</strong> - never qualifies/disqualifies. Shows in the
                  submission&apos;s Custom details.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1 pl-6">
                {question.options.map((opt, oi) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      value={opt.label}
                      placeholder="Answer option"
                      onChange={(e) => setOption(qi, oi, { label: e.target.value })}
                    />
                    {/* Points count only for respondents who PASS the gate. A
                        disqualifying option ends the visit with no submission, so its
                        number is never scored; it is still editable rather than hidden,
                        because an option can stop disqualifying later and losing the
                        number on the way through would be its own surprise. */}
                    <label className="flex items-center gap-1 whitespace-nowrap text-xs">
                      <span className="text-[var(--muted-foreground)]">Points</span>
                      <Input
                        className="w-20"
                        type="number"
                        value={String(opt.points ?? 0)}
                        onChange={(e) =>
                          setOption(qi, oi, { points: Math.trunc(Number(e.target.value) || 0) })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-1 whitespace-nowrap text-xs">
                      <input
                        type="checkbox"
                        checked={opt.disqualifies}
                        onChange={(e) => setOption(qi, oi, { disqualifies: e.target.checked })}
                      />
                      Disqualifies
                    </label>
                    {/* THE ROUTE, right where the decision is made. Type a name and
                        that exit appears in the exit step below, ready to write. Leave
                        it blank and they go out through the first exit, which is what
                        every disqualifying answer did before routes existed. */}
                    {opt.disqualifies ? (
                      <ExitNameField
                        value={exitNameOf(opt.exitKey ?? "")}
                        onCommit={(typed) => commitExitName(qi, oi, typed)}
                        locked={!canRoute && exits.length > 0 && !!exits[0]?.name.trim()}
                      />
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => removeOption(qi, oi)}>✕</Button>
                  </div>
                ))}
                <div>
                  <Button size="sm" variant="outline" onClick={() => addOption(qi)}>+ Add option</Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!canRoute ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-[var(--muted-foreground)]">
            Your plan has <strong>one exit</strong>, so every disqualifying answer leaves by the
            same door. Signal and up adds a named exit per answer, each with its own page and its
            own Meta event. Score bands below work on your plan either way.
          </p>
        ) : null}

        {/* Names already in use, so the second answer routing to "Waitlist" lands on
            the same exit as the first instead of creating a near-duplicate. */}
        <datalist id="gate-exit-names">
          {exits.map((e, i) => (
            <option key={e.key} value={exitLabel(e, i)} />
          ))}
        </datalist>

        {/* SCORE BANDS. The answer to "I do not want to lose someone qualified": a weak
            answer on one axis is survivable, the total decides, and the middle band is
            a queue you read rather than a door that slams. */}
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={q.bands.enabled}
              disabled={!canBands}
              onChange={(e) => setQ((s) => ({ ...s, bands: { ...s.bands, enabled: e.target.checked } }))}
            />
            Route on the total score as well
          </label>
          {!canBands ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              🟡 Score bands need a paid plan. They are the part that lets you set a real bar
              without losing someone who is strong everywhere but one answer.
            </p>
          ) : null}
          <p className="text-xs text-[var(--muted-foreground)]">
            Scored on the points above, after every question is answered. Anyone hitting a
            disqualifying answer leaves before this is reached. The score is never shown to the
            respondent and never reaches their browser.
          </p>
          {q.bands.enabled ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Through at this score and above</Label>
                <Input
                  type="number"
                  value={String(q.bands.passMin)}
                  onChange={(e) => setQ((s) => ({ ...s, bands: { ...s.bands, passMin: Math.trunc(Number(e.target.value) || 0) } }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Through but tagged REVIEW, down to</Label>
                <Input
                  type="number"
                  value={String(q.bands.reviewMin)}
                  onChange={(e) => setQ((s) => ({ ...s, bands: { ...s.bands, reviewMin: Math.trunc(Number(e.target.value) || 0) } }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Below that, exit through</Label>
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                  value={q.bands.belowExitKey ?? ""}
                  onChange={(e) => setQ((s) => ({ ...s, bands: { ...s.bands, belowExitKey: e.target.value } }))}
                >
                  <option value="">First exit</option>
                  {exits.map((e, i) => (
                    <option key={e.key} value={e.key}>{exitLabel(e, i)}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={q.showGateOnResult}
              onChange={(e) => setQ((s) => ({ ...s, showGateOnResult: e.target.checked }))}
            />
            <span>
              Show these answers and points on the result page
              <span className="block text-xs text-[var(--muted-foreground)]">
                On since this funnel was built. Turn it off for a gate you score privately - but
                leave it on for a funnel whose gate IS the assessment, or the result page has
                nothing left to show.
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={addQuestion}>+ Add question</Button>
          <Button size="sm" variant="outline" onClick={addTextQuestion}>+ Add text question</Button>
          <Button size="sm" onClick={saveQual} disabled={pending}>{pending ? "Saving…" : "Save qualification"}</Button>
          {qMsg ? <span className={MSG_CLASS[qMsg.tone]}>{qMsg.text}</span> : null}
        </div>
      </div>
      ) : null}

      {showExit ? (
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        {/* "Disqualified page" said what the system calls it, not what it is. The
            person reading this screen needs to know it is the LAST thing a rejected
            visitor sees, and that nothing about them is kept - that is what decides
            how it should be written. */}
        <p className="text-sm font-medium">Where the people you turn away actually go</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          One exit, or as many as the gate needs. An answer sends somebody to the exit named
          beside it; anything unnamed goes out through the first. Name a route on an answer above
          and it appears here, waiting to be written.
        </p>

        {exits.map((exit, i) => (
          <div key={exit.key} className="flex flex-col gap-3 rounded-md border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
                <Label className="text-xs">Exit name</Label>
                <Input
                  value={exit.name}
                  placeholder={`Exit ${i + 1}`}
                  onChange={(e) => setExit(exit.key, { name: e.target.value })}
                />
              </div>
              <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
                <Label className="text-xs">What happens here</Label>
                <select
                  className="h-10 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                  value={exit.mode}
                  onChange={(e) => {
                    const v = e.target.value;
                    setExit(exit.key, { mode: v === "OPTIN" ? "OPTIN" : v === "CONTINUE" ? "CONTINUE" : "PAGE" });
                  }}
                >
                  <option value="PAGE">Show this page and stop</option>
                  <option value="OPTIN">Ask for their details, then show it</option>
                  <option value="CONTINUE">Ask for their details, then let them take the assessment</option>
                </select>
              </div>
              {exits.length > 1 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500 text-red-600 hover:bg-red-500/10"
                  onClick={() => removeExit(exit.key)}
                >
                  Remove
                </Button>
              ) : null}
            </div>

            {exit.mode === "OPTIN" ? (
              <p className="rounded-md bg-[var(--muted)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
                Not a rejection. They are sent to the opt-in form, their details are captured, the
                lead webhook fires, and this page is the thank-you. They never answer the
                assessment, so they stay out of your completion rates.
              </p>
            ) : null}
            {exit.mode === "CONTINUE" ? (
              <p className="rounded-md bg-[var(--muted)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
                They opt in and then answer the whole assessment, reaching the same result page as
                everybody else. For the waitlist case: these people are qualified, what they failed
                was a date, and a finished diagnosis is worth more than a thank-you page. Their
                close is set on the <strong>result page</strong> - give the blocks they should not
                see (a seat button, a scarcity line) an audience of <strong>main path only</strong>,
                and write their own CTA as a block for this route. The page below is not used.
                Meta hears about them once, at the gate, under the event named above and nothing
                after; if they never finish, the CRM still gets the abandoned event.
              </p>
            ) : null}

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Heading</Label>
              <Input
                value={exit.heading}
                placeholder="This assessment is built for founders running a business."
                onChange={(e) => setExit(exit.key, { heading: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Subtext</Label>
              <Input value={exit.subtext} onChange={(e) => setExit(exit.key, { subtext: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Body (HTML allowed)</Label>
              <Textarea
                rows={4}
                value={exit.bodyHtml}
                spellCheck={false}
                onChange={(e) => setExit(exit.key, { bodyHtml: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Button label (optional)</Label>
                <Input value={exit.buttonLabel} onChange={(e) => setExit(exit.key, { buttonLabel: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Button URL (optional)</Label>
                <Input
                  value={exit.buttonUrl}
                  placeholder="https://…"
                  onChange={(e) => setExit(exit.key, { buttonUrl: e.target.value })}
                />
              </div>
            </div>

            {/* ONE EVENT, ONE MEANING. Two exits that mean different things must not
                report the same event, or the exclusion audience learns the wrong people. */}
            <div className="flex flex-col gap-2 border-t pt-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exit.fireDisqualifiedEvent}
                  onChange={(e) => setExit(exit.key, { fireDisqualifiedEvent: e.target.checked })}
                />
                Report this exit to Meta
              </label>
              {exit.fireDisqualifiedEvent ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Event name</Label>
                    <Input
                      value={exit.eventName}
                      placeholder={i === 0 ? "GateDisqualified" : "GateWaitlisted"}
                      onChange={(e) => setExit(exit.key, { eventName: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">content_category (optional)</Label>
                    <Input
                      value={exit.contentCategory}
                      placeholder="not_yet / wrong_fit"
                      onChange={(e) => setExit(exit.key, { contentCategory: e.target.value })}
                    />
                  </div>
                </div>
              ) : null}
              {exit.mode === "CONTINUE" ? (
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Event when they COMPLETE the assessment (optional)</Label>
                  <Input
                    value={exit.completionEventName}
                    placeholder="Leave blank: nothing is sent"
                    onChange={(e) => setExit(exit.key, { completionEventName: e.target.value })}
                  />
                  {!exit.completionEventName.trim() ? (
                    <p className="text-xs text-[var(--muted-foreground)]">
                      🟢 Blank, so these completions report nothing to Meta. Right for a waitlist:
                      they opted in, so they are in your CRM with full contact details, which is
                      where the next-cycle list gets built and sent from. They never touch
                      CompleteRegistration or your completion event, which is the part that would
                      have cost money.
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Only needed if you want Meta to hold its own copy of this audience. The CRM
                      has them either way.
                    </p>
                  )}
                </div>
              ) : null}
              {exit.fireDisqualifiedEvent && !exit.eventName.trim() ? (
                exit.mode === "OPTIN" || exit.mode === "CONTINUE" ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    🟡 No event name, so this exit reports nothing. These people are not
                    rejections, so falling back to GateDisqualified would put them in your
                    exclusion audience - give them their own event instead.
                  </p>
                ) : i > 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    🟡 Reports as <strong>GateDisqualified</strong>, the same event as the first
                    exit. Right when both mean &ldquo;keep these people out of the ad set&rdquo; -
                    use content_category to tell them apart. Wrong if this exit means something
                    else.
                  </p>
                ) : null
              ) : null}
            </div>
          </div>
        ))}

        {!canRoute && exits.length > 0 ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-[var(--muted-foreground)]">
            One exit on your plan. Signal and up lets each disqualifying answer leave by its own
            door, with its own page and its own Meta event, so a waitlist and a wrong-fit
            rejection stop sharing one audience.
          </p>
        ) : null}

        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={!canRoute && exits.length > 0}
            onClick={() =>
              setD((s) => {
                const list = s.exits.length > 0 ? s.exits : readExits(s);
                return {
                  ...s,
                  exits: [
                    ...list,
                    {
                      key: `exit_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                      name: "",
                      mode: "PAGE" as const,
                      heading: "",
                      subtext: "",
                      bodyHtml: "",
                      buttonLabel: "",
                      buttonUrl: "",
                      fireDisqualifiedEvent: true,
                      eventName: "",
                      contentCategory: "",
                      completionEventName: "",
                    },
                  ],
                };
              })
            }
          >
            + Add an exit
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={saveDisq} disabled={pending}>{pending ? "Saving…" : "Save exits"}</Button>
          {dMsg ? <span className={MSG_CLASS[dMsg.tone]}>{dMsg.text}</span> : null}
        </div>
      </div>
      ) : null}
    </div>
  );
}

/**
 * The name of the exit an answer routes to, typed right where the answer is.
 *
 * Deliberately a free text field with suggestions rather than a dropdown of existing
 * routes: naming the thing is how it gets created, and a dropdown would mean leaving
 * this screen to add a route before being able to point at it. The list of names
 * already in use is offered so the second question that exits to "Waitlist" lands on
 * the same route as the first.
 *
 * Committed on blur, so typing a name does not leave a trail of half-named exits.
 */
function ExitNameField({
  value,
  onCommit,
  locked = false,
}: {
  value: string;
  onCommit: (typed: string) => void;
  /** The plan has its one exit already, so naming another would be refused on save.
   *  Shown as a dead field with the reason, rather than as a vanishing name. */
  locked?: boolean;
}) {
  const [text, setText] = useState(value);
  // The committed name wins whenever it changes underneath (a rename in the exit step,
  // or the key resolving to a route that was just created).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
  return (
    <input
      className="h-9 w-32 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
      list="gate-exit-names"
      disabled={locked}
      placeholder={locked ? "One exit" : "Exit name"}
      title={
        locked
          ? "Your plan has one exit, so every disqualifying answer uses it. Signal and up adds a named exit per answer."
          : "Which exit this answer goes to. Blank = the first exit."
      }
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim() !== value.trim()) onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
