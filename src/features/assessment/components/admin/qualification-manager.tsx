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

export function QualificationManager({
  assessmentId,
  initialQualification,
  initialDisqualified,
}: {
  assessmentId: string;
  initialQualification: QualificationInput;
  initialDisqualified: DisqualifiedContentInput;
}) {
  const router = useRouter();
  const [q, setQ] = useState<QualificationInput>(initialQualification);
  const [d, setD] = useState<DisqualifiedContentInput>(initialDisqualified);
  const [qMsg, setQMsg] = useState<string | null>(null);
  const [dMsg, setDMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // ---- qualification editing helpers ----
  const addQuestion = () =>
    setQ((s) => ({ ...s, questions: [...s.questions, {
      id: uid(), text: "", type: "choice", placeholder: "", required: false,
      options: [
        { id: uid(), label: "", disqualifies: false },
        { id: uid(), label: "", disqualifies: false },
      ],
    }] }));
  const addTextQuestion = () =>
    setQ((s) => ({ ...s, questions: [...s.questions, {
      id: uid(), text: "", type: "text", placeholder: "", required: false, options: [],
    }] }));
  const removeQuestion = (qi: number) =>
    setQ((s) => ({ ...s, questions: s.questions.filter((_, i) => i !== qi) }));
  const setQuestionText = (qi: number, text: string) =>
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, text } : x)) }));
  const patchQuestion = (qi: number, patch: Partial<{ placeholder: string; required: boolean }>) =>
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, ...patch } : x)) }));
  const addOption = (qi: number) =>
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, options: [...x.options, { id: uid(), label: "", disqualifies: false }] } : x)) }));
  const removeOption = (qi: number, oi: number) =>
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, options: x.options.filter((_, j) => j !== oi) } : x)) }));
  const setOption = (qi: number, oi: number, patch: Partial<{ label: string; disqualifies: boolean }>) =>
    setQ((s) => ({ ...s, questions: s.questions.map((x, i) => (i === qi ? { ...x, options: x.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : x)) }));

  const saveQual = () =>
    start(async () => {
      setQMsg(null);
      const res = await saveQualification(assessmentId, q);
      setQMsg(res.ok ? "Qualification saved." : res.error);
      if (res.ok) router.refresh();
    });
  const saveDisq = () =>
    start(async () => {
      setDMsg(null);
      const res = await saveDisqualifiedContent(assessmentId, d);
      setDMsg(res.ok ? "Disqualified page saved." : res.error);
      if (res.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={q.enabled} onChange={(e) => setQ((s) => ({ ...s, enabled: e.target.checked }))} />
          Enable qualification gate (Page 1, shown before the assessment)
        </label>
        <p className="text-xs text-[var(--muted-foreground)]">
          Questions show one at a time and auto-advance. Tick <strong>Disqualifies</strong> on any answer
          that should send the person to the disqualified page instead of the assessment. No lead,
          submission or result is created for a disqualified person.
        </p>

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
                  Free text for your <strong>manual review</strong> — never qualifies/disqualifies. Shows in the
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
          {qMsg ? <span className="text-sm text-[var(--muted-foreground)]">{qMsg}</span> : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Disqualified page</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Shown to a disqualified person. Nothing about them is stored.
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
          <Button size="sm" onClick={saveDisq} disabled={pending}>{pending ? "Saving…" : "Save disqualified page"}</Button>
          {dMsg ? <span className="text-sm text-[var(--muted-foreground)]">{dMsg}</span> : null}
        </div>
      </div>
    </div>
  );
}
