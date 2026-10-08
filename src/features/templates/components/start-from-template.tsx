"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { applyTemplateToAssessment } from "@/features/templates/actions/library";
import { SHAPE_LABELS, SHAPE_HINTS } from "@/features/templates/schema";
import { type TemplateListItem } from "@/features/templates/data";
import { BuilderStepNav } from "@/features/admin/components/builder-tab-context";

/**
 * Step 1 of the builder: fill this assessment from a template.
 *
 * It lays the template over THIS assessment rather than creating another one. The
 * other reading - import makes a separate draft - is what the Templates page does, and
 * doing that from inside an editor would leave somebody with two assessments and the
 * wrong one open.
 *
 * It only offers itself on an EMPTY assessment. Laying a template over questions that
 * already exist means deleting them, and a template picked by mistake would take an
 * afternoon with it. Once there is content the step says so and points at the Templates
 * page, where importing makes a new draft and destroys nothing - which is why there is
 * no confirm dialog anywhere here. Nothing destructive is ever one click away.
 */
export function StartFromTemplate({
  assessmentId,
  templates,
  hasContent,
  templatesHref,
}: {
  assessmentId: string;
  templates: TemplateListItem[];
  /** This assessment already has questions, bands or a gate. */
  hasContent: boolean;
  templatesHref: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  function apply(t: TemplateListItem) {
    setMsg(null);
    setBusy(t.id);
    start(async () => {
      const r = await applyTemplateToAssessment(assessmentId, t.id);
      setBusy(null);
      if (!r.ok) {
        setMsg({ tone: "bad", text: r.error });
        return;
      }
      const prompt = r.data?.promptVersionLabel
        ? ` Its AI instructions were saved as "${r.data.promptVersionLabel}" and selected for you.`
        : "";
      setMsg({
        tone: "ok",
        text: `Built from "${t.title}". Your title and link are unchanged - everything else came from the template.${prompt}`,
      });
      router.refresh();
    });
  }

  if (hasContent) {
    return (
      <section className="flex flex-col gap-3">
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">This assessment already has questions.</p>
          <p className="mt-1 text-[var(--muted-foreground)]">
            A template can only be laid over an empty one - otherwise choosing the wrong template would
            delete work. To start from a template instead, import one from{" "}
            <a href={templatesHref} className="underline">
              Templates
            </a>
            . That makes a new draft and leaves this one exactly as it is.
          </p>
        </div>
        <BuilderStepNav step="template" />
      </section>
    );
  }

  if (templates.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <div className="rounded-lg border p-4 text-sm text-[var(--muted-foreground)]">
          No templates are published yet. Carry on to the next step and write your own.
        </div>
        <BuilderStepNav step="template" />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {msg ? (
        <p className={msg.tone === "ok" ? "text-sm text-green-700" : "text-sm text-amber-700"}>{msg.text}</p>
      ) : null}

      <p className="text-xs text-[var(--muted-foreground)]">
        Pick one and the whole funnel is written for you - gate, questions, categories, bands and the AI
        instructions. Your title and link stay as you set them, and nothing goes live until you publish.
      </p>

      <ul className="flex flex-col gap-2">
        {templates.map((t) => (
          <li key={t.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{t.title}</p>
                <Badge variant="muted">{t.category}</Badge>
              </div>
              {t.summary ? <p className="mt-1 text-sm text-[var(--muted-foreground)]">{t.summary}</p> : null}
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {SHAPE_LABELS[t.shape]} - {SHAPE_HINTS[t.shape]}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {t.gateQuestions > 0 ? `${t.gateQuestions} gate` : "No gate"}
                {t.questions > 0 ? ` · ${t.questions} scored` : ""}
                {t.hasAiPrompt ? " · includes AI instructions" : " · no AI statement"}
              </p>
            </div>
            <Button size="sm" disabled={busy !== null} onClick={() => apply(t)}>
              {busy === t.id ? "Building..." : "Use this template"}
            </Button>
          </li>
        ))}
      </ul>

      <BuilderStepNav step="template" />
    </section>
  );
}
