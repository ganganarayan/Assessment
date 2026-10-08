"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { importTemplate, deleteMyTemplate } from "@/features/templates/actions/library";
import { SHAPE_LABELS, SHAPE_HINTS } from "@/features/templates/schema";
import { type TemplateListItem } from "@/features/templates/data";

/**
 * The shelf a workspace imports from.
 *
 * Used in two places with the same code: the dedicated /w/templates page and the
 * collapsible section at the top of the dashboard. A second, "compact" copy of this
 * list would drift within a month, and the dashboard is where most imports will start,
 * so it is the copy that must not be the stale one.
 *
 * Imports are DELIBERATELY not confirmed. The result is a draft inside their own
 * workspace that nobody else can see and that they can delete in two clicks - putting
 * a confirm dialog in front of it would be ceremony around an action with no
 * consequence. The outcome is announced instead, with a link straight into the editor.
 */

interface Props {
  items: TemplateListItem[];
  /** Shown collapsed-by-default on a long page; the dashboard passes false. */
  collapsible?: boolean;
  /** Start open. The dashboard wants this open: an empty builder is the problem the
   *  library exists to solve, so hiding it behind a click defeats the point. */
  defaultOpen?: boolean;
  heading?: string;
  blurb?: string;
  /** Set when the workspace cannot create another assessment, so the row explains
   *  itself instead of failing at the click. */
  capReason?: string | null;
  canEdit: boolean;
  /**
   * Show each row's published state, and where it goes.
   *
   * Only the platform owner's view passes this. A tenant is shown the shelf and the
   * shelf is all published by definition, so a badge saying so on every row would be
   * noise; the owner is shown the shelf AND what is still behind the counter, and for
   * him the difference between the two is the most important thing on the screen.
   */
  showPublishState?: boolean;
  /** Where "manage these" goes. Omitted = no link. */
  manageHref?: string | null;
}

export function TemplateLibrary({
  items,
  collapsible = false,
  defaultOpen = true,
  heading = "Templates",
  blurb = "Start from a working funnel and edit it. Importing makes a private draft in this workspace - nothing goes live until you publish it.",
  capReason = null,
  canEdit,
  showPublishState = false,
  manageHref = null,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string; href?: string } | null>(null);

  function doImport(t: TemplateListItem) {
    setMsg(null);
    setPendingId(t.id);
    start(async () => {
      const r = await importTemplate(t.id);
      setPendingId(null);
      if (!r.ok) {
        setMsg({ tone: "bad", text: r.error });
        return;
      }
      const promptLine = r.data?.promptVersionLabel
        ? ` Its AI instructions were saved as "${r.data.promptVersionLabel}" and selected for you.`
        : "";
      setMsg({
        tone: "ok",
        text: `Imported as a draft.${promptLine}`,
        href: r.data ? `/w/assessments/${r.data.assessmentId}` : undefined,
      });
      router.refresh();
    });
  }

  function doDelete(t: TemplateListItem) {
    if (!confirm(`Remove "${t.title}" from your templates? The assessments you made from it are not affected.`)) return;
    setPendingId(t.id);
    start(async () => {
      const r = await deleteMyTemplate(t.id);
      setPendingId(null);
      if (!r.ok) setMsg({ tone: "bad", text: r.error });
      else router.refresh();
    });
  }

  if (items.length === 0) return null;

  const groups: Array<{ category: string; items: TemplateListItem[] }> = [];
  for (const it of items) {
    const key = it.mine ? "Your templates" : it.category;
    const last = groups[groups.length - 1];
    if (last && last.category === key) last.items.push(it);
    else groups.push({ category: key, items: [it] });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg">{heading}</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{blurb}</p>
          </div>
          <div className="flex items-center gap-2">
            {manageHref ? (
              <a href={manageHref} className="text-sm font-medium underline underline-offset-2 hover:no-underline">
                Manage
              </a>
            ) : null}
            {collapsible ? (
              <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
                {open ? "Hide" : `Show ${items.length}`}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      {open ? (
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
          {capReason ? <p className="text-sm text-amber-700">{capReason}</p> : null}

          {groups.map((g) => (
            <div key={g.category} className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {g.category}
              </p>
              <ul className="flex flex-col gap-2">
                {g.items.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{t.title}</p>
                        {t.mine ? <Badge variant="muted">Yours</Badge> : null}
                        {showPublishState ? (
                          t.published ? (
                            <Badge variant="success">On the shelf</Badge>
                          ) : (
                            <Badge variant="outline">Not published - nobody can see it</Badge>
                          )
                        ) : null}
                        {t.reviewStatus === "PENDING" ? <Badge variant="outline">Awaiting review</Badge> : null}
                        {t.reviewStatus === "REJECTED" ? <Badge variant="outline">Not accepted</Badge> : null}
                      </div>
                      {t.summary ? (
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{t.summary}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {SHAPE_LABELS[t.shape]} - {SHAPE_HINTS[t.shape]}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {t.gateQuestions > 0 ? `${t.gateQuestions} gate question${t.gateQuestions === 1 ? "" : "s"}` : "No gate"}
                        {t.questions > 0 ? ` · ${t.questions} scored question${t.questions === 1 ? "" : "s"}` : ""}
                        {t.hasAiPrompt ? " · includes AI instructions" : " · no AI statement"}
                      </p>
                      {t.reviewNote ? (
                        <p className="mt-1 text-xs text-amber-700">Reviewer: {t.reviewNote}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {canEdit && t.importable ? (
                        <Button
                          size="sm"
                          onClick={() => doImport(t)}
                          disabled={pendingId !== null || !!capReason}
                        >
                          {pendingId === t.id ? "Importing..." : "Import"}
                        </Button>
                      ) : null}
                      {canEdit && t.canRemove ? (
                        <Button size="sm" variant="ghost" onClick={() => doDelete(t)} disabled={pendingId !== null}>
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
