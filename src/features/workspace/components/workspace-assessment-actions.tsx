"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  setAssessmentStatus,
  deleteAssessment,
  duplicateAssessment,
} from "@/features/assessment/actions/assessment";
import { Button, buttonVariants } from "@/components/ui/button";
import { SaveAsTemplateButton } from "@/features/templates/components/save-as-template";
import { cn } from "@/lib/utils";

/** Publish / preview / duplicate / delete + tenant-scoped Export for the tenant
 *  editor. Export/import stay within this workspace (see /api/w/... + /w/import).
 *
 *  "Save as template" lives here rather than on its own screen: the moment somebody
 *  wants to reuse a funnel is the moment they are looking at it. It expands in place
 *  because the destination choice (private or contributed) needs reading, and a choice
 *  that matters does not belong in a dropdown. */
export function WorkspaceAssessmentActions({
  id,
  slug,
  title,
  published,
  publishBlock = null,
}: {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  /** Why publishing is unavailable (the Meta pixel lock), or null when it is fine.
   *  Resolved on the server: the button is the visible half of a rule the action
   *  enforces anyway, so the two can never disagree about whether it applies. */
  publishBlock?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      await setAssessmentStatus(id, !published);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Delete this assessment? This cannot be undone.")) return;
    start(async () => {
      const res = await deleteAssessment(id);
      if (res.ok) router.push("/w/assessments");
    });
  }

  function duplicate() {
    start(async () => {
      const res = await duplicateAssessment(id);
      if (res.ok && res.data) router.push(`/w/assessments/${res.data.id}`);
      else if (!res.ok) alert(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/a/${slug}?preview=1`}
        target="_blank"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        Preview
      </Link>
      <Button size="sm" variant="ghost" onClick={duplicate} disabled={pending}>
        Duplicate
      </Button>
      <details className="relative">
        <summary className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer list-none")}>
          Export ▼
        </summary>
        <div className="absolute right-0 z-10 mt-1 flex w-36 flex-col rounded-md border bg-[var(--background)] p-1 text-sm shadow">
          <a href={`/api/w/assessments/${id}/export?format=json`} className="rounded px-2 py-1.5 hover:bg-[var(--muted)]">
            JSON
          </a>
          <a href={`/api/w/assessments/${id}/export?format=csv`} className="rounded px-2 py-1.5 hover:bg-[var(--muted)]">
            CSV
          </a>
        </div>
      </details>
      {/* Unpublishing is NEVER blocked - taking your own funnel down is not something
          to stand in the way of. Only the publish direction is locked. */}
      <Button
        size="sm"
        variant="outline"
        onClick={toggle}
        disabled={pending || (!published && !!publishBlock)}
        title={!published && publishBlock ? publishBlock : undefined}
      >
        {published ? "Unpublish" : "Publish"}
      </Button>
      <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
        Delete
      </Button>
      <SaveAsTemplateButton assessmentId={id} defaultTitle={title} />
      {!published && publishBlock ? (
        <p className="w-full text-sm text-red-600">
          {publishBlock}{" "}
          <a className="font-medium underline" href="/w/settings">
            Open Settings
          </a>
        </p>
      ) : null}
    </div>
  );
}
