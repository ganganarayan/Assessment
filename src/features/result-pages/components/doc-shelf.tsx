"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { importShelfDoc } from "@/features/result-pages/actions/docs";
import { KIND_LABEL, groupShelf, type ShelfRow } from "@/features/result-pages/docs";

/**
 * The platform shelf, as a workspace sees it: result pages and VSL pages the owner
 * published, each one importable as your own copy.
 *
 * Import COPIES. You get your own page with your own slug, unpublished and bound to no
 * funnel, which is the only safe shape for this: the binding is 1:1, so a workspace can
 * never be pointed at a platform row that somebody else edits.
 *
 * Imports are not confirmed, deliberately. The result is a draft in your own library
 * that nobody else can see and that you can delete in two clicks - a dialog in front of
 * that is ceremony around an action with no consequence. The outcome is announced
 * instead, with a link straight into the editor.
 */
export function DocShelf({
  rows,
  basePath,
  canEdit,
  /** The owner's own view, where unlisted rows are shown and labelled. */
  showListedState = false,
}: {
  rows: ShelfRow[];
  basePath: string;
  canEdit: boolean;
  showListedState?: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string; href?: string } | null>(null);

  if (rows.length === 0) return null;

  function doImport(row: ShelfRow) {
    setBusy(row.id);
    setMsg(null);
    start(async () => {
      const r = await importShelfDoc(row.id);
      setBusy(null);
      if (!r.ok) {
        setMsg({ tone: "bad", text: r.error });
        return;
      }
      setMsg({
        tone: "ok",
        text: "Imported as your own draft. Change what differs, then bind it to a funnel.",
        href: r.data ? `${basePath}/${r.data.id}` : undefined,
      });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Start from a template</CardTitle>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Pages built for you to copy. Importing makes your own page in this workspace - nothing is live until you bind
          it to a funnel and publish it.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {msg ? (
          <p className={msg.tone === "ok" ? "text-sm text-green-700" : "text-sm text-amber-700"}>
            {msg.text}{" "}
            {msg.href ? (
              <a className="font-medium underline" href={msg.href}>
                Open it
              </a>
            ) : null}
          </p>
        ) : null}

        {groupShelf(rows).map((g) => (
          <div key={g.category} className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{g.category}</p>
            <ul className="flex flex-col gap-2">
              {g.rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{row.title}</p>
                      <Badge variant="muted">{KIND_LABEL[row.kind]}</Badge>
                      {showListedState ? (
                        row.listed ? (
                          <Badge variant="success">On the shelf</Badge>
                        ) : (
                          <Badge variant="outline">Not published - nobody can see it</Badge>
                        )
                      ) : null}
                    </div>
                    {row.summary ? (
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{row.summary}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {row.kind === "VSL"
                        ? `${row.size} block${row.size === 1 ? "" : "s"}`
                        : `${row.size} page${row.size === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button size="sm" disabled={busy !== null} onClick={() => doImport(row)}>
                        {busy === row.id ? "Importing..." : "Import"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
