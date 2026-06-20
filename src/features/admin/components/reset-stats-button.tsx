"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resetStats } from "@/features/admin/actions/analytics";

export function ResetStatsButton() {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            "Reset Stats and Contacts to 0 from now?\n\nPast leads are kept (still on the Submissions page) but hidden from analytics. Numbers will start climbing again with new traffic.",
          )
        )
          return;
        start(async () => {
          await resetStats();
          router.refresh();
        });
      }}
    >
      {pending ? "Resetting…" : "Reset to 0"}
    </Button>
  );
}
