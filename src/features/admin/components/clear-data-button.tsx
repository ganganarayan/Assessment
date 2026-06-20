"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { clearAnalyticsData } from "@/features/admin/actions/analytics";

/**
 * One-time destructive control: permanently delete all submissions + page views
 * (Stats and Contacts go to zero). Assessments are kept. Double-confirms.
 */
export function ClearDataButton() {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="outline"
      className="border-red-500 text-red-600 hover:bg-red-500/10"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            "Permanently DELETE all submissions, contacts and stats?\n\nAssessments are kept. New data starts from zero. This CANNOT be undone.",
          )
        )
          return;
        if (!confirm("Final check — this wipes every lead and page view. Click OK to delete permanently.")) return;
        start(async () => {
          await clearAnalyticsData();
          router.refresh();
        });
      }}
    >
      {pending ? "Clearing…" : "Clear all data"}
    </Button>
  );
}
