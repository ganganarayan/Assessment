"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewAssessmentText,
  createAssessmentFromText,
  type ImportTextPreview,
} from "@/features/assessment/actions/import-text";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SAMPLE = `Title: Emotional Stability Assessment
Description: A quick read on how you're holding up.

## Sleep & Recovery
1. How well do you sleep most nights?
   - Very poorly = 1
   - Poorly = 2
   - Well = 3
   - Very well = 4
2. How rested do you wake up?
   - Exhausted = 1
   - Groggy = 2
   - Fresh = 4
Bands:
   - 0-40 = Depleted | You're running on empty here
   - 41-70 = Coping | Holding, with strain
   - 71-100 = Strong | A real asset

## Stress Load
1. How often do you feel overwhelmed?
   - Daily = 1
   - Weekly = 2
   - Rarely = 4

## Bands
- LOW 0-40 = Fragile | You're running on empty
- MEDIUM 41-70 = Steady | Room to grow
- HIGH 71-100 = Resilient | A strong foundation`;

export function TextImport() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportTextPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const hasErrors = (preview?.errors.length ?? 0) > 0;
  const canCreate = preview !== null && !hasErrors && preview.categories > 0;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    setPreview(null);
    setError(null);
  }

  function runPreview() {
    setError(null);
    start(async () => {
      const res = await previewAssessmentText(text);
      if (!res.ok) {
        setPreview(null);
        setError(res.error);
        return;
      }
      if (res.data) setPreview(res.data);
    });
  }

  function runCreate() {
    setError(null);
    start(async () => {
      const res = await createAssessmentFromText(text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data) {
        router.push(`/admin/assessments/${res.data.id}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">From plain text / Markdown</CardTitle>
          <CardDescription>
            Paste the whole assessment, or upload a .txt / .md file, then Preview → Create. Numbered lines
            are questions; bullets are options (<span className="font-mono">label = score</span>). Add a per-category{" "}
            <span className="font-mono">Bands:</span> block and an overall <span className="font-mono">## Bands</span> section
            (percentage ranges).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={onFile}
              className="text-sm"
            />
            {fileName ? <span className="text-xs text-[var(--muted-foreground)]">{fileName}</span> : null}
            <Button size="sm" variant="ghost" type="button" onClick={() => { setText(SAMPLE); setPreview(null); setError(null); }}>
              Insert sample
            </Button>
          </div>
          <Textarea
            rows={14}
            value={text}
            onChange={(e) => { setText(e.target.value); setPreview(null); }}
            placeholder={SAMPLE}
            spellCheck={false}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={runPreview} disabled={pending || !text.trim()}>
              {pending ? "Working…" : "Preview"}
            </Button>
            <Button type="button" onClick={runCreate} disabled={pending || !canCreate}>
              Create assessment
            </Button>
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card className={hasErrors ? "border-red-500" : undefined}>
          <CardHeader>
            <CardTitle className="text-base">{preview.title || "Untitled"}</CardTitle>
            <CardDescription>
              {preview.categories} categories · {preview.questions} questions · {preview.options} options ·{" "}
              {preview.categoryBands} category bands · {preview.overallBands} overall bands
              {preview.slug ? <> · <span className="font-mono">/a/{preview.slug}</span></> : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {hasErrors ? (
              <div>
                <p className="font-medium text-red-500">Fix these errors, then Preview again:</p>
                <ul className="list-disc pl-5 text-red-500">
                  {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            ) : (
              <p className="text-green-600">🟢 Looks good — ready to create.</p>
            )}
            {preview.warnings.length > 0 ? (
              <div>
                <p className="font-medium text-amber-500">Warnings (import still allowed):</p>
                <ul className="list-disc pl-5 text-[var(--muted-foreground)]">
                  {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
