"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  setAssessmentStatus,
  deleteAssessment,
} from "@/features/assessment/actions/assessment";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AssessmentRowActions({
  id,
  slug,
  published,
}: {
  id: string;
  slug: string;
  published: boolean;
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
      await deleteAssessment(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/admin/assessments/${id}`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Edit
      </Link>
      <Link
        href={`/a/${slug}?preview=1`}
        target="_blank"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        Preview
      </Link>
      <details className="relative">
        <summary
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "cursor-pointer list-none",
          )}
        >
          Export ▼
        </summary>
        <div className="absolute right-0 z-10 mt-1 flex w-36 flex-col rounded-md border bg-[var(--background)] p-1 text-sm shadow">
          <a
            href={`/api/admin/assessments/${id}/export?format=json`}
            className="rounded px-2 py-1.5 hover:bg-[var(--muted)]"
          >
            JSON
          </a>
          <a
            href={`/api/admin/assessments/${id}/export?format=csv`}
            className="rounded px-2 py-1.5 hover:bg-[var(--muted)]"
          >
            CSV
          </a>
        </div>
      </details>
      <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
        {published ? "Unpublish" : "Publish"}
      </Button>
      <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
        Delete
      </Button>
    </div>
  );
}
