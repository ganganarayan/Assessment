"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatIST } from "@/lib/date";
import {
  regenerateAiStatement,
  saveManualAiStatement,
  saveReportNote,
  setDefaultAiStatement,
  deleteAiStatements,
  type AiStatementRow,
} from "@/features/admin/actions/ai-statements";

export function AiStatementManager({
  slug,
  submissionId,
  rows,
  initialNote,
}: {
  slug: string;
  submissionId: string;
  rows: AiStatementRow[];
  /** The saved "Add to PDF" note (post-call action items), if any. */
  initialNote?: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"ai" | "manual" | "note">("ai");
  const [instruction, setInstruction] = useState("");
  const [manual, setManual] = useState("");
  const [note, setNote] = useState(initialNote ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okText: string,
    after?: () => void,
  ) => {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setMsg({ ok: false, text: res.error ?? "Something went wrong." });
        return;
      }
      setMsg({ ok: true, text: okText });
      after?.();
      router.refresh();
    });
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Personalized message — versions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "ai" ? "default" : "outline"} onClick={() => setMode("ai")}>
            Ask AI
          </Button>
          <Button size="sm" variant={mode === "manual" ? "default" : "outline"} onClick={() => setMode("manual")}>
            Write my own
          </Button>
          <Button size="sm" variant={mode === "note" ? "default" : "outline"} onClick={() => setMode("note")}>
            Add to PDF
          </Button>
        </div>

        {mode === "ai" ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Tell the AI how to change it (e.g. 'shorter, and use the word Critical'), or leave blank to just regenerate from the scores."
            />
            <div>
              <Button size="sm" disabled={pending} onClick={() => run(() => regenerateAiStatement(slug, submissionId, instruction), "New AI version added.", () => setInstruction(""))}>
                {pending ? "Working…" : "Update AI Response"}
              </Button>
            </div>
          </div>
        ) : mode === "manual" ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Write the exact message you want this person to see."
            />
            <div>
              <Button size="sm" disabled={pending} onClick={() => run(() => saveManualAiStatement(slug, submissionId, manual), "Saved your version.", () => setManual(""))}>
                {pending ? "Saving…" : "Save version"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={6}
              placeholder="Action items / meeting summary to include at the BOTTOM of this person's PDF report (e.g. what you agreed after the 1:1). Leave blank to remove it."
            />
            <div>
              <Button size="sm" disabled={pending} onClick={() => run(() => saveReportNote(slug, submissionId, note), "Saved to the PDF.")}>
                {pending ? "Saving…" : "Save to PDF"}
              </Button>
            </div>
          </div>
        )}

        {msg ? (
          <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No versions yet. Generate one with AI or write your own above, then set it as default.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r, i) => (
              <div key={r.id} className={cn("rounded-lg border p-3", r.isDefault && "border-cyan-500")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`default-${submissionId}`}
                      checked={r.isDefault}
                      disabled={pending}
                      onChange={() => run(() => setDefaultAiStatement(slug, submissionId, r.id), "Default updated — this goes to the VSL.")}
                    />
                    <span className="font-medium">Version {i + 1}</span>
                    {r.isDefault ? (
                      <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-xs font-medium text-white">
                        Default · shows on VSL
                      </span>
                    ) : null}
                  </label>
                  {!r.isDefault ? (
                    <label className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                      select to delete
                    </label>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm">{r.text}</p>
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {r.source === "manual" ? "Written by you" : "AI"}
                  {r.instruction ? ` · “${r.instruction}”` : ""} · {formatIST(r.createdAt)} IST
                </p>
              </div>
            ))}
          </div>
        )}

        {selected.size > 0 ? (
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => deleteAiStatements(slug, submissionId, [...selected]), "Deleted.", () => setSelected(new Set()))}
              className="border-red-500 text-red-600 hover:bg-red-500/10"
            >
              Delete selected ({selected.size})
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
