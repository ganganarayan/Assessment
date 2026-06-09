"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewImport,
  importAssessment,
} from "@/features/assessment/actions/transfer";
import type {
  ImportMode,
  ImportPreview,
} from "@/features/assessment/transfer/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ImportWizard() {
  const router = useRouter();
  const [raw, setRaw] = useState<string | null>(null);
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setRaw(null);
    setFileName("");
    setPreview(null);
    setErrors([]);
    setError(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(null);
    setErrors([]);
    setError(null);

    const text = await file.text();
    const fmt = file.name.toLowerCase().endsWith(".csv") ? "csv" : "json";
    setRaw(text);
    setFormat(fmt);
    setFileName(file.name);

    start(async () => {
      const res = await previewImport(text, fmt);
      if (!res.ok) {
        setErrors(res.errors ?? [res.error]);
        return;
      }
      if (res.data) setPreview(res.data);
    });
  }

  function runImport(mode: ImportMode) {
    if (!raw) return;
    if (mode === "replace") {
      const ok = confirm(
        "Replace will permanently DELETE the existing assessment with this slug — including its submissions — then recreate it. Continue?",
      );
      if (!ok) return;
    }
    setError(null);
    start(async () => {
      const res = await importAssessment(raw, format, mode);
      if (!res.ok) {
        setError(res.error);
        if (res.errors) setErrors(res.errors);
        return;
      }
      if (res.data) {
        router.push(`/admin/assessments/${res.data.id}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>Accepted: .json (lossless) or .csv (structure only).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <input
            type="file"
            accept=".json,.csv,application/json,text/csv"
            onChange={onFile}
            className="text-sm"
          />
          {fileName ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              {fileName} · detected format:{" "}
              <span className="font-mono uppercase">{format}</span>
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

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>Confirm before importing.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Row label="Assessment" value={preview.title} />
            <Row label="Slug" value={`/a/${preview.slug}`} />
            <Row label="Categories" value={String(preview.categoryCount)} />
            <Row label="Questions" value={String(preview.questionCount)} />
            <Row label="Result bands" value={String(preview.resultBandCount)} />

            {preview.slugExists ? (
              <div className="flex flex-col gap-3 rounded-md border border-amber-500 p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="muted">Slug exists</Badge>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    An assessment with “{preview.slug}” already exists.
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={reset} disabled={pending}>
                    Cancel
                  </Button>
                  <Button onClick={() => runImport("copy")} disabled={pending}>
                    Create copy
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => runImport("replace")}
                    disabled={pending}
                  >
                    Replace existing
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button onClick={() => runImport("create")} disabled={pending}>
                  {pending ? "Importing…" : "Import"}
                </Button>
                <Button variant="ghost" onClick={reset} disabled={pending}>
                  Cancel
                </Button>
              </div>
            )}

            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
