"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  previewAssessmentText,
  createAssessmentFromText,
  importBandsForAssessment,
  type ImportTextPreview,
  type CreatedFromText,
  type SuggestedOverallBand,
  type SuggestedCategory,
} from "@/features/assessment/actions/import-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

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

  // Step 2 state (populated after the assessment is created).
  const [created, setCreated] = useState<CreatedFromText | null>(null);
  const [overall, setOverall] = useState<SuggestedOverallBand[]>([]);
  const [cats, setCats] = useState<SuggestedCategory[]>([]);
  const [bandsMsg, setBandsMsg] = useState<string | null>(null);
  const [bandsErr, setBandsErr] = useState<string | null>(null);

  const hasErrors = (preview?.errors.length ?? 0) > 0;
  const canCreate = preview !== null && !hasErrors && preview.categories > 0;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setText(await file.text());
    setFileName(file.name);
    setPreview(null);
    setError(null);
  }

  function runPreview() {
    setError(null);
    start(async () => {
      const res = await previewAssessmentText(text);
      if (!res.ok) { setPreview(null); setError(res.error); return; }
      if (res.data) setPreview(res.data);
    });
  }

  function runCreate() {
    setError(null);
    start(async () => {
      const res = await createAssessmentFromText(text);
      if (!res.ok) { setError(res.error); return; }
      if (res.data) {
        setCreated(res.data);
        setOverall(res.data.overallBands);
        setCats(res.data.categories);
        setBandsMsg(null);
        setBandsErr(null);
      }
    });
  }

  function importBands() {
    if (!created) return;
    setBandsErr(null);
    setBandsMsg(null);
    start(async () => {
      const res = await importBandsForAssessment({
        assessmentId: created.id,
        overall,
        categories: cats.map((c) => ({ categoryId: c.categoryId, bands: c.bands })),
      });
      if (!res.ok) { setBandsErr(res.error ?? "Import failed."); return; }
      setBandsMsg("Bands imported.");
      router.refresh();
    });
  }

  // ---- band editing helpers ----
  const updOverall = (i: number, patch: Partial<SuggestedOverallBand>) =>
    setOverall((p) => p.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const addOverall = () =>
    setOverall((p) => [...p, { level: "LOW", min: 0, max: 0, title: "", description: "" }]);
  const rmOverall = (i: number) => setOverall((p) => p.filter((_, idx) => idx !== i));

  const updCatBand = (ci: number, bi: number, patch: Partial<SuggestedCategory["bands"][number]>) =>
    setCats((p) => p.map((c, idx) => (idx === ci ? { ...c, bands: c.bands.map((b, j) => (j === bi ? { ...b, ...patch } : b)) } : c)));
  const addCatBand = (ci: number) =>
    setCats((p) => p.map((c, idx) => (idx === ci ? { ...c, bands: [...c.bands, { min: 0, max: 0, label: "", meaning: "" }] } : c)));
  const rmCatBand = (ci: number, bi: number) =>
    setCats((p) => p.map((c, idx) => (idx === ci ? { ...c, bands: c.bands.filter((_, j) => j !== bi) } : c)));

  // ---------- STEP 2 : bands ----------
  if (created) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="border-green-600">
          <CardHeader>
            <CardTitle className="text-base">Step 2 — review &amp; import bands</CardTitle>
            <CardDescription>
              Assessment <span className="font-mono">/a/{created.slug}</span> was created (draft). These bands are
              <strong> suggestions from your text</strong> — edit them, then import. Nothing here is saved until you
              click <strong>Import bands</strong>. Ranges are percentages (0–100), non-overlapping.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Overall */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Overall result bands</p>
              <div className="flex flex-col gap-2">
                {overall.map((b, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-9 rounded-md border bg-[var(--background)] px-2 text-sm"
                      value={b.level}
                      onChange={(e) => updOverall(i, { level: e.target.value as SuggestedOverallBand["level"] })}
                    >
                      {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <Input className="w-16" type="number" value={b.min} onChange={(e) => updOverall(i, { min: Number(e.target.value) })} aria-label="min %" />
                    <span className="text-xs">–</span>
                    <Input className="w-16" type="number" value={b.max} onChange={(e) => updOverall(i, { max: Number(e.target.value) })} aria-label="max %" />
                    <Input className="w-40" value={b.title} placeholder="Title" onChange={(e) => updOverall(i, { title: e.target.value })} />
                    <Input className="min-w-[12rem] flex-1" value={b.description} placeholder="Description (optional)" onChange={(e) => updOverall(i, { description: e.target.value })} />
                    <Button size="sm" variant="ghost" onClick={() => rmOverall(i)}>✕</Button>
                  </div>
                ))}
                <div><Button size="sm" variant="outline" onClick={addOverall}>+ Add band</Button></div>
              </div>
            </div>

            {/* Per category */}
            {cats.map((c, ci) => (
              <div key={c.categoryId} className="flex flex-col gap-2 border-t pt-3">
                <p className="text-sm font-medium">{c.name} — category bands</p>
                <div className="flex flex-col gap-2">
                  {c.bands.map((b, bi) => (
                    <div key={bi} className="flex flex-wrap items-center gap-2">
                      <Input className="w-16" type="number" value={b.min} onChange={(e) => updCatBand(ci, bi, { min: Number(e.target.value) })} aria-label="min %" />
                      <span className="text-xs">–</span>
                      <Input className="w-16" type="number" value={b.max} onChange={(e) => updCatBand(ci, bi, { max: Number(e.target.value) })} aria-label="max %" />
                      <Input className="w-40" value={b.label} placeholder="Label" onChange={(e) => updCatBand(ci, bi, { label: e.target.value })} />
                      <Input className="min-w-[12rem] flex-1" value={b.meaning} placeholder="Meaning (optional)" onChange={(e) => updCatBand(ci, bi, { meaning: e.target.value })} />
                      <Button size="sm" variant="ghost" onClick={() => rmCatBand(ci, bi)}>✕</Button>
                    </div>
                  ))}
                  <div><Button size="sm" variant="outline" onClick={() => addCatBand(ci)}>+ Add band</Button></div>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button onClick={importBands} disabled={pending}>{pending ? "Importing…" : "Import bands"}</Button>
              <Link href={`/admin/assessments/${created.id}`} className="text-sm underline">Open assessment in builder →</Link>
              {bandsMsg ? <span className="text-sm text-green-600">🟢 {bandsMsg}</span> : null}
              {bandsErr ? <span className="text-sm text-red-500">{bandsErr}</span> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- STEP 1 : assessment ----------
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 1 — import the assessment</CardTitle>
          <CardDescription>
            Paste the whole assessment or upload a .txt / .md file, then Preview → Create. Numbered lines are
            questions; bullets are options (<span className="font-mono">label = score</span>). Bands in the text are
            just suggestions — you edit and import them in step 2.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={onFile} className="text-sm" />
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
              {preview.overallBands} overall + {preview.categoryBands} category bands suggested
              {preview.slug ? <> · <span className="font-mono">/a/{preview.slug}</span></> : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {hasErrors ? (
              <div>
                <p className="font-medium text-red-500">Fix these errors, then Preview again:</p>
                <ul className="list-disc pl-5 text-red-500">{preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            ) : (
              <p className="text-green-600">🟢 Structure looks good — create it, then review the bands.</p>
            )}
            {preview.warnings.length > 0 ? (
              <div>
                <p className="font-medium text-amber-500">Notes (you can fix bands in step 2):</p>
                <ul className="list-disc pl-5 text-[var(--muted-foreground)]">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
