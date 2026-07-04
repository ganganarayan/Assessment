"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  setAssessmentStatus,
  deleteAssessment,
} from "@/features/assessment/actions/assessment";
import { Button, buttonVariants } from "@/components/ui/button";

/** Publish / preview / delete for the tenant editor. Uses the tenant-scoped
 *  actions (which reject cross-tenant ids) — no admin export links. */
export function WorkspaceAssessmentActions({
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
      const res = await deleteAssessment(id);
      if (res.ok) router.push("/w/assessments");
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
      <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
        {published ? "Unpublish" : "Publish"}
      </Button>
      <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
        Delete
      </Button>
    </div>
  );
}
