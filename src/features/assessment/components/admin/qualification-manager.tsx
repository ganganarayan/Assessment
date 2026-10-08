"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveQualification,
  saveDisqualifiedContent,
} from "@/features/assessment/actions/qualification";
import type { QualificationInput, DisqualifiedContentInput } from "@/features/assessment/schemas";
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
}) {
  const router = useRouter();
  const [q, setQ] = useState<QualificationInput>(initialQualification);
  const [d, setD] = useState<DisqualifiedContentInput>(initialDisqualified);
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
        { id: uid(), label: "", disqualifies: false, points: 0 },
        { id: uid(), label: "", disqualifies: false, points: 0 },
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
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, options: [...x.options, { id: uid(), label: "", disqualifies: false, points: 0 }] } : x)) }));
  const removeOption = (qi: number, oi: number) =>
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, options: x.options.filter((_, j) => j !== oi) } : x)) }));
  const setOption = (qi: number, oi: number, patch: Partial<{ label: string; disqualifies: boolean; points: number }>) =>
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
      const res = await saveDisqualifiedContent(assessmentId, d);
      setDMsg(res.ok ? { tone: "ok", text: "Saved." } : { tone: "error", text: res.error });
      if (res.ok) router.refresh();
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
        <p className="text-sm font-medium">The page they see when they don&apos;t qualify</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Shown instead of the assessment. They never become a lead and nothing about them is stored,
          so this is your last word to them - worth being gracious about, and worth a link somewhere
          useful if you have one.
        </p>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Heading</Label>
          <Input value={d.heading} placeholder="This assessment is built for founders running a business." onChange={(e) => setD((s) => ({ ...s, heading: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Subtext</Label>
          <Input value={d.subtext} onChange={(e) => setD((s) => ({ ...s, subtext: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Body (HTML allowed)</Label>
          <Textarea rows={5} value={d.bodyHtml} onChange={(e) => setD((s) => ({ ...s, bodyHtml: e.target.value }))} spellCheck={false} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Button label (optional)</Label>
            <Input value={d.buttonLabel} onChange={(e) => setD((s) => ({ ...s, buttonLabel: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Button URL (optional)</Label>
            <Input value={d.buttonUrl} placeholder="https://…" onChange={(e) => setD((s) => ({ ...s, buttonUrl: e.target.value }))} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.fireDisqualifiedEvent} onChange={(e) => setD((s) => ({ ...s, fireDisqualifiedEvent: e.target.checked }))} />
          Fire a custom <span className="font-mono">Disqualified</span> Meta pixel event (to build an exclusion audience)
        </label>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={saveDisq} disabled={pending}>{pending ? "Saving…" : "Save this page"}</Button>
          {dMsg ? <span className={MSG_CLASS[dMsg.tone]}>{dMsg.text}</span> : null}
        </div>
      </div>
      ) : null}
    </div>
  );
}
