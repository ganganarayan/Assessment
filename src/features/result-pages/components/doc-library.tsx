"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createDoc, cloneDoc, renameDoc, deleteDoc } from "@/features/result-pages/actions/docs";
import { KIND_LABEL, KIND_BLURB, RESULT_PAGE_KINDS, type DocKind, type DocRow } from "@/features/result-pages/docs";

/**
 * The result-page shelf.
 *
 * One list for both kinds, because they answer the same question in the same place:
 * which pages do I have, which funnel is each one on, and which are free to use. The
 * row states it in those words - "Free to use" or "Used by <funnel>" - since that is
 * the only thing that decides whether you can bind it or have to clone it.
 *
 * Clone is the headline action, not an afterthought. The binding is 1:1 on purpose, so
 * cloning is not a workaround for a missing feature; it IS how the same page reaches a
 * second funnel, and it is the reason an edit here can never touch somebody else's
 * live traffic.
 */

interface Props {
  rows: DocRow[];
  /** "/admin/result-pages" or "/w/result-pages" - the editor lives under it. */
  basePath: string;
  canEdit: boolean;
}

export function DocLibrary({ rows, basePath, canEdit }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [newFor, setNewFor] = useState<DocKind | null>(null);
  const [newTitle, setNewTitle] = useState("");

  function doCreate(kind: DocKind) {
    const title = newTitle.trim();
    if (!title) return;
    setBusy("new");
    setMsg(null);
    start(async () => {
      const r = await createDoc(kind, title);
      setBusy(null);
      if (!r.ok) {
        setMsg({ tone: "bad", text: r.error });
        return;
      }
      setNewTitle("");
      setNewFor(null);
      if (r.data) router.push(`${basePath}/${r.data.id}`);
      else router.refresh();
    });
  }

  function doClone(row: DocRow) {
    setBusy(row.id);
    setMsg(null);
    start(async () => {
      const r = await cloneDoc(row.id);
      setBusy(null);
      if (!r.ok) {
        setMsg({ tone: "bad", text: r.error });
        return;
      }
      setMsg({ tone: "ok", text: `Copied. The copy is free to use on any funnel - change what differs, then bind it.` });
      if (r.data) router.push(`${basePath}/${r.data.id}`);
      else router.refresh();
    });
  }

  function doRename(row: DocRow) {
    const next = window.prompt("Name this page", row.title);
    if (next === null) return;
    setBusy(row.id);
    setMsg(null);
    start(async () => {
      const r = await renameDoc(row.id, next);
      setBusy(null);
      if (!r.ok) setMsg({ tone: "bad", text: r.error });
      else router.refresh();
    });
  }

  function doDelete(row: DocRow) {
    if (!window.confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    setBusy(row.id);
    setMsg(null);
    start(async () => {
      const r = await deleteDoc(row.id);
      setBusy(null);
      if (!r.ok) setMsg({ tone: "bad", text: r.error });
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {msg ? (
        <p className={msg.tone === "ok" ? "text-sm text-green-700" : "text-sm text-amber-700"}>{msg.text}</p>
      ) : null}

      {RESULT_PAGE_KINDS.map((kind) => {
        const mine = rows.filter((r) => r.kind === kind);
        return (
          <Card key={kind}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-lg">{KIND_LABEL[kind]}s</CardTitle>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">{KIND_BLURB[kind]}</p>
                </div>
                {canEdit ? (
                  <Button size="sm" onClick={() => setNewFor(newFor === kind ? null : kind)}>
                    {newFor === kind ? "Cancel" : "New page"}
                  </Button>
                ) : null}
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-3">
              {newFor === kind ? (
                <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
                  <Input
                    autoFocus
                    value={newTitle}
                    placeholder={kind === "VSL" ? "e.g. Clinic VSL - October" : "e.g. Clinic results - October"}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") doCreate(kind);
                    }}
                  />
                  <Button disabled={busy !== null || !newTitle.trim()} onClick={() => doCreate(kind)}>
                    {busy === "new" ? "Creating..." : "Create"}
                  </Button>
                </div>
              ) : null}

              {mine.length === 0 ? (
                <p className="rounded-lg border p-4 text-sm text-[var(--muted-foreground)]">
                  No {KIND_LABEL[kind].toLowerCase()}s yet. Create one here, or open a funnel that already has one -
                  its page is in this library too, and you can clone it from the row below once it appears.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {mine.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`${basePath}/${row.id}`} className="font-medium underline-offset-2 hover:underline">
                            {row.title}
                          </Link>
                          {row.boundTo ? (
                            <Badge variant="muted">Used by {row.boundTo.title}</Badge>
                          ) : (
                            <Badge variant="outline">Free to use</Badge>
                          )}
                          {row.published ? (
                            <Badge variant="success">Published</Badge>
                          ) : (
                            <Badge variant="outline">Draft</Badge>
                          )}
                        </div>
                        <p className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">{row.slug}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {row.kind === "VSL"
                            ? `${row.size} block${row.size === 1 ? "" : "s"}`
                            : `${row.size} page${row.size === 1 ? "" : "s"}`}
                          {row.sourceSlug ? ` · copied from ${row.sourceSlug}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Link
                          href={`${basePath}/${row.id}`}
                          className={buttonVariants({ size: "sm", variant: "outline" })}
                        >
                          Edit
                        </Link>
                        {canEdit ? (
                          <>
                            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => doClone(row)}>
                              {busy === row.id ? "Working..." : "Clone"}
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => doRename(row)}>
                              Rename
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => doDelete(row)}>
                              Delete
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
