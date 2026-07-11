"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { testAi, type PromptVersionView } from "@/features/admin/actions/ai-settings";
import {
  createPromptVersion,
  updatePromptVersion,
  deletePromptVersion,
  setDefaultPromptVersion,
  updateWordWindow,
} from "@/features/admin/actions/prompt-versions";

export function PromptVersionsManager({
  versions,
  wordMin,
  wordMax,
  sampleName,
}: {
  versions: PromptVersionView[];
  wordMin: number;
  wordMax: number;
  sampleName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [min, setMin] = useState(String(wordMin));
  const [max, setMax] = useState(String(wordMax));
  const [wordMsg, setWordMsg] = useState<string | null>(null);

  const saveWords = () =>
    start(async () => {
      setWordMsg(null);
      const r = await updateWordWindow(Number(min), Number(max));
      setWordMsg(r.ok ? "Saved." : r.error);
      if (r.ok) router.refresh();
    });

  const add = () =>
    start(async () => {
      await createPromptVersion();
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Word window — tenant-wide */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Message length — min words</Label>
          <Input className="w-28" type="number" value={min} onChange={(e) => setMin(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">max words</Label>
          <Input className="w-28" type="number" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" onClick={saveWords} disabled={pending}>
          Save length
        </Button>
        {wordMsg ? <span className="text-xs text-[var(--muted-foreground)]">{wordMsg}</span> : null}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--muted-foreground)]">
          Write plain instructions; the app assembles the full system prompt (with the safety
          crisis line, length, and format). Your instructions are saved as you leave them.
        </p>
        <Button size="sm" onClick={add} disabled={pending}>
          + Add system prompt version
        </Button>
      </div>

      {versions.map((v) => (
        <VersionCard key={v.id} v={v} sampleName={sampleName} />
      ))}
    </div>
  );
}

function VersionCard({ v, sampleName }: { v: PromptVersionView; sampleName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(v.label);
  const [instructions, setInstructions] = useState(v.instructions);
  const [showSystem, setShowSystem] = useState(false);
  const [sample, setSample] = useState<{ ok: boolean; text?: string; error?: string; ms: number } | null>(null);

  const save = () =>
    start(async () => {
      const r = await updatePromptVersion(v.id, label, instructions);
      if (r.ok) {
        setEditing(false);
        router.refresh();
      }
    });

  const makeDefault = () =>
    start(async () => {
      await setDefaultPromptVersion(v.id);
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      if (!confirm("Delete this version? Assessments using it fall back to the default.")) return;
      const r = await deletePromptVersion(v.id);
      if (r.ok) router.refresh();
    });

  const gen = () =>
    start(async () => {
      setSample(null);
      setSample(await testAi(v.id));
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {editing ? (
            <Input className="h-8 w-56" value={label} onChange={(e) => setLabel(e.target.value)} />
          ) : (
            <span className="font-semibold">{v.label}</span>
          )}
          {v.active ? <Badge variant="success">Default</Badge> : null}
          {v.builtin ? <Badge variant="muted">Built-in</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!v.active ? (
            <Button size="sm" variant="outline" onClick={makeDefault} disabled={pending}>
              Set as default
            </Button>
          ) : null}
          {!v.builtin ? (
            editing ? (
              <Button size="sm" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )
          ) : null}
          {!v.builtin ? (
            <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      {!v.builtin ? (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Instructions for the system prompt</Label>
          <Textarea
            rows={8}
            readOnly={!editing}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="How should the AI turn the scores into the message? Tone, the arc (appreciate → pain → hope), how to treat low/mid/high categories, what to emphasize…"
            className={editing ? "" : "opacity-80"}
          />
        </div>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">{v.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="text-sm underline"
          onClick={() => setShowSystem((s) => !s)}
        >
          {showSystem ? "▼ Hide" : "▶ View"} assembled system prompt
        </button>
        <Button size="sm" variant="outline" onClick={gen} disabled={pending}>
          Generate sample ({sampleName})
        </Button>
      </div>

      {showSystem ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-[var(--muted)] p-3 text-xs">
          {v.system}
        </pre>
      ) : null}

      {sample ? (
        <div className="rounded-md border p-3 text-sm">
          {sample.ok ? (
            <p className="whitespace-pre-wrap">{sample.text}</p>
          ) : (
            <p className="text-red-500">Failed: {sample.error}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
