"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveAsTemplate } from "@/features/templates/actions/library";
import { TEMPLATE_CATEGORIES } from "@/features/templates/schema";

/**
 * "Save as template" in the builder.
 *
 * The destination is the whole decision and it is presented as two plain sentences
 * rather than a dropdown, because the two outcomes are not variations of each other:
 * one keeps the funnel inside this workspace, the other offers it to every workspace on
 * the platform. A radio nobody read is how someone publishes their client's questions
 * by accident.
 *
 * The AI instructions field is left blank on purpose. Blank means "carry whatever this
 * assessment already uses", resolved server-side from this workspace's own prompt
 * version - so the normal path is to press Save and the prompt comes along.
 */
export function SaveAsTemplateButton({
  assessmentId,
  defaultTitle,
}: {
  assessmentId: string;
  defaultTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState<"private" | "contribute">("private");
  const [title, setTitle] = useState(defaultTitle);
  const [category, setCategory] = useState<string>(TEMPLATE_CATEGORIES[0]);
  const [summary, setSummary] = useState("");
  const [aiInstructions, setAiInstructions] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  function save() {
    setMsg(null);
    setBusy(true);
    start(async () => {
      const r = await saveAsTemplate(assessmentId, { destination, title, category, summary, aiInstructions });
      setBusy(false);
      if (!r.ok) {
        setMsg({ tone: "bad", text: r.error });
        return;
      }
      setMsg({
        tone: "ok",
        text: r.data?.pending
          ? "Sent to the template library. It stays invisible to other workspaces until it is reviewed, and you can withdraw it from your Templates page until then."
          : "Saved to your own templates. Only this workspace can see it.",
      });
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Save as template
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">Save as template</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      <fieldset className="mt-3 flex flex-col gap-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="template-destination"
            className="mt-1"
            checked={destination === "private"}
            onChange={() => setDestination("private")}
          />
          <span>
            <span className="font-medium">Keep it private</span>
            <span className="block text-[var(--muted-foreground)]">
              Only this workspace sees it. Use it to start your next funnel from this one.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="template-destination"
            className="mt-1"
            checked={destination === "contribute"}
            onChange={() => setDestination("contribute")}
          />
          <span>
            <span className="font-medium">Contribute it to the library</span>
            <span className="block text-[var(--muted-foreground)]">
              Offer it to every workspace. It is reviewed first and stays hidden until then. Accepted
              contributions can earn an extension of your credit period, at the platform&apos;s discretion and
              limited to one per calendar month.
            </span>
          </span>
        </label>
      </fieldset>

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
          AI instructions to include <span className="text-[var(--muted-foreground)]">(leave blank to carry this assessment&apos;s own)</span>
        </Label>
        <Textarea
          rows={3}
          value={aiInstructions}
          onChange={(e) => setAiInstructions(e.target.value)}
          placeholder="Blank is usually right - whatever prompt this assessment uses comes with it."
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving..." : destination === "contribute" ? "Send for review" : "Save to my templates"}
        </Button>
        {msg ? (
          <p className={msg.tone === "ok" ? "text-sm text-green-700" : "text-sm text-amber-700"}>{msg.text}</p>
        ) : null}
      </div>
    </div>
  );
}
