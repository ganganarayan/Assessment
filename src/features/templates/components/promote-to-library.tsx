"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { promoteAssessmentToLibrary } from "@/features/templates/actions/templates";
import { TEMPLATE_CATEGORIES } from "@/features/templates/schema";

/**
 * "Add to template library" on a platform assessment.
 *
 * The owner's counterpart to Save as template, and deliberately not the same panel: a
 * tenant chooses between keeping a funnel private and offering it for review, and
 * neither of those decisions exists here. What the owner decides instead is the one
 * thing that panel cannot express - whether this goes on the shelf of every workspace
 * now, or sits in the library unpublished until it has been read.
 *
 * The category has NO default. A pre-selected first option is how a SaaS funnel ends up
 * filed under Coaches, and the heading it lands under is how anyone finds it at all.
 *
 * The AI instructions box is blank and means blank. The platform's own result-statement
 * instructions are not carried into a template that every workspace can import; the
 * server enforces that, and the hint says so rather than leaving it to be discovered.
 */
export function PromoteToLibraryButton({
  assessmentId,
  defaultTitle,
}: {
  assessmentId: string;
  defaultTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState("");
  const [aiInstructions, setAiInstructions] = useState("");
  const [publish, setPublish] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  function save() {
    setMsg(null);
    setBusy(true);
    start(async () => {
      const r = await promoteAssessmentToLibrary(assessmentId, {
        title,
        category,
        summary,
        aiInstructions,
        publish,
      });
      setBusy(false);
      if (!r.ok) {
        setMsg({ tone: "bad", text: r.error });
        return;
      }
      setMsg({
        tone: "ok",
        text: r.data?.published
          ? "On the shelf. Every workspace can see it now."
          : "In the library, visible to nobody. Tick Published on the Templates screen when you are happy with it.",
      });
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Add to template library
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">Add to template library</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Copies this funnel as a starting point any workspace can import. The assessment itself is not
        changed, and later edits to it do not reach the template.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Category</Label>
          <select
            className="h-10 rounded-md border bg-transparent px-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Pick one</option>
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Summary</Label>
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Who it is for, in one line"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <Label className="text-xs">
          AI instructions to include{" "}
          <span className="text-[var(--muted-foreground)]">
            (blank means none - the platform&apos;s own prompt is never copied into a template)
          </span>
        </Label>
        <Textarea
          rows={3}
          value={aiInstructions}
          onChange={(e) => setAiInstructions(e.target.value)}
          placeholder="Leave blank unless you want to ship instructions with this template."
        />
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
        <span>
          <span className="font-medium">Publish it to every workspace now</span>
          <span className="block text-[var(--muted-foreground)]">
            Off, it sits in the library and nobody sees it until you tick Published on the{" "}
            <Link href="/admin/templates" className="underline">
              Templates
            </Link>{" "}
            screen.
          </span>
        </span>
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Adding..." : "Add to library"}
        </Button>
        {msg ? (
          <p className={msg.tone === "ok" ? "text-sm text-green-700" : "text-sm text-amber-700"}>{msg.text}</p>
        ) : null}
      </div>
    </div>
  );
}
