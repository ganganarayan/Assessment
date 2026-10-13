"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { bindDoc, unbindDoc, createAndBindDoc } from "@/features/result-pages/actions/docs";
import { KIND_LABEL, type DocKind } from "@/features/result-pages/docs";

/**
 * The assessment builder's end of the link: which result page this funnel uses.
 *
 * The step no longer holds an editor. One page is edited in one place - the library -
 * because the page is a record of its own, and two editors for one record is how a
 * draft gets saved over. What lives here is the choice: pick a free page, start a new
 * one, or let go of the one bound now.
 *
 * The dropdown lists FREE pages only. A page in use elsewhere is deliberately absent
 * rather than offered and refused: the binding is 1:1, so the honest list is the one
 * you can act on, and Clone (in the library) is how a used page reaches this funnel.
 */

interface Props {
  assessmentId: string;
  kind: DocKind;
  /** The page bound now, or null. */
  bound: { id: string; title: string; slug: string; published: boolean; publishedAt: string | null } | null;
  /** Pages of this kind bound to nothing, in this workspace. */
  free: { id: string; title: string; slug: string; published: boolean }[];
  /** "/admin/result-pages" or "/w/result-pages". */
  basePath: string;
  canEdit: boolean;
}

export function DocBinder({ assessmentId, kind, bound, free, basePath, canEdit }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  function run(fn: () => Promise<{ ok: true; data?: { id: string } } | { ok: false; error: string }>, goToEditor = false) {
    setBusy(true);
    setErr(null);
    start(async () => {
      const r = await fn();
      setBusy(false);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      if (goToEditor && r.ok && r.data?.id) router.push(`${basePath}/${r.data.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {bound ? (
        <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{bound.title}</p>
              {bound.published ? <Badge variant="success">Published</Badge> : <Badge variant="outline">Draft</Badge>}
            </div>
            <p className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">{bound.slug}</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {bound.published
                ? "Live on this funnel. Editing it in the library and publishing again updates this funnel, and only this one."
                : "Not live yet. Open it, build it, then Publish there."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link href={`${basePath}/${bound.id}`} className={buttonVariants({ size: "sm" })}>
              Edit page
            </Link>
            {canEdit ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Remove "${bound.title}" from this funnel? The page stays in your library, and this funnel stops showing it.`,
                    )
                  )
                    return;
                  run(() => unbindDoc(assessmentId, kind));
                }}
              >
                {busy ? "Working..." : "Unbind"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border p-3 text-sm text-[var(--muted-foreground)]">
          This funnel has no {KIND_LABEL[kind].toLowerCase()}. Pick one of your free pages, or start a new one - it goes
          into your library, where it can later be cloned for the next funnel.
        </p>
      )}

      {canEdit ? (
        <div className="flex flex-col gap-2">
          {free.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
              >
                <option value="">{bound ? "Swap for a free page..." : "Use one of your free pages..."}</option>
                {free.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                    {f.published ? " (published)" : " (draft)"}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={busy || !pick}
                onClick={() => run(() => bindDoc(assessmentId, kind, pick))}
              >
                {busy ? "Working..." : "Use this page"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">
              No free {KIND_LABEL[kind].toLowerCase()}s. Every page you have is already on a funnel - clone one in the{" "}
              <Link href={basePath} className="underline">
                library
              </Link>{" "}
              to use it here too.
            </p>
          )}

          {creating ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                autoFocus
                value={title}
                placeholder={kind === "VSL" ? "Name this VSL page" : "Name this results page"}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && title.trim()) run(() => createAndBindDoc(assessmentId, kind, title), true);
                }}
              />
              <Button
                size="sm"
                disabled={busy || !title.trim()}
                onClick={() => run(() => createAndBindDoc(assessmentId, kind, title), true)}
              >
                {busy ? "Creating..." : "Create and open"}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                Start a new page
              </Button>
              <Link href={basePath} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                Open the library
              </Link>
            </div>
          )}
        </div>
      ) : null}

      {err ? <p className="text-sm text-amber-700">{err}</p> : null}
    </div>
  );
}
