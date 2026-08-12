"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewImport,
  importAssessments,
} from "@/features/assessment/actions/transfer";
import type {
  ImportMode,
  ImportPreviewItem,
} from "@/features/assessment/transfer/schema";
import type { ActionResult } from "@/features/assessment/actions/shared";

type PreviewAction = (raw: string, format: "json" | "csv") => Promise<ActionResult<ImportPreviewItem[]> & { errors?: string[] }>;
type ImportAction = (raw: string, format: "json" | "csv", mode: ImportMode) => Promise<ActionResult<{ count: number }> & { errors?: string[] }>;
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ImportWizard({
  previewAction = previewImport,
  importAction = importAssessments,
  doneHref = "/admin/assessments",
}: {
  previewAction?: PreviewAction;
  importAction?: ImportAction;
  doneHref?: string;
} = {}) {
  const router = useRouter();
  const [raw, setRaw] = useState<string | null>(null);
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<ImportPreviewItem[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [pending, start] = useTransition();

  const anyExists = items?.some((i) => i.slugExists) ?? false;

  function reset() {
    setRaw(null);
    setFileName("");
    setItems(null);
    setErrors([]);
    setError(null);
    setInputKey((k) => k + 1); // remount the file input so the same file re-fires
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setItems(null);
    setErrors([]);
    setError(null);

    const text = await file.text();
    const fmt = file.name.toLowerCase().endsWith(".csv") ? "csv" : "json";
    input.value = ""; // allow re-selecting the same file after a failed import
    setRaw(text);
    setFormat(fmt);
    setFileName(file.name);

    start(async () => {
      const res = await previewAction(text, fmt);
      if (!res.ok) {
        setErrors(res.errors ?? [res.error]);
        return;
      }
      if (res.data) setItems(res.data);
    });
  }

  function runImport(mode: ImportMode) {
    if (!raw) return;
    if (mode === "replace") {
      const ok = confirm(
        "Replace will permanently DELETE the existing assessment(s) with matching slug(s) — including their submissions — then recreate. Continue?",
      );
      if (!ok) return;
    }
    setError(null);
    start(async () => {
      const res = await importAction(raw, format, mode);
      if (!res.ok) {
        setError(res.error);
        if (res.errors) setErrors(res.errors);
        return;
      }
      router.push(doneHref);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>Accepted: .json or .csv (the same format Export produces).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <input key={inputKey} type="file" accept=".json,.csv,application/json,text/csv" onChange={onFile} className="text-sm" />
          {fileName ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              {fileName} · detected format: <span className="font-mono uppercase">{format}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      {errors.length > 0 ? (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-base">Validation errors</CardTitle>
            <CardDescription>Fix these and re-upload.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm text-red-500">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {items ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview ({items.length})</CardTitle>
            <CardDescription>Confirm before importing.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-3 py-1.5">Assessment</th>
                    <th className="px-3 py-1.5">Slug</th>
                    <th className="px-3 py-1.5">Categories</th>
                    <th className="px-3 py-1.5">Questions</th>
                    <th className="px-3 py-1.5">Bands</th>
                    <th className="px-3 py-1.5">Exists?</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((it) => (
                    <tr key={it.slug}>
                      <td className="px-3 py-1.5">{it.title}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">/a/{it.slug}</td>
                      <td className="px-3 py-1.5">{it.categoryCount}</td>
                      <td className="px-3 py-1.5">{it.questionCount}</td>
                      <td className="px-3 py-1.5">{it.resultBandCount}</td>
                      <td className="px-3 py-1.5">
                        {it.slugExists ? <Badge variant="muted">exists</Badge> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {anyExists ? (
              <div className="flex flex-col gap-3 rounded-md border border-amber-500 p-3">
                <span className="text-xs text-[var(--muted-foreground)]">
                  Some slugs already exist. Choose how to handle duplicates:
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={reset} disabled={pending}>Cancel</Button>
                  <Button onClick={() => runImport("copy")} disabled={pending}>Create copy</Button>
                  <Button variant="outline" onClick={() => runImport("replace")} disabled={pending}>
                    Replace existing
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button onClick={() => runImport("create")} disabled={pending}>
                  {pending ? "Importing…" : `Import ${items.length}`}
                </Button>
                <Button variant="ghost" onClick={reset} disabled={pending}>Cancel</Button>
              </div>
            )}

            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
