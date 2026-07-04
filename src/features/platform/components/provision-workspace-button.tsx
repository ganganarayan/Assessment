"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { provisionMyWorkspace } from "@/features/platform/self-provision";

export function ProvisionWorkspaceButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await provisionMyWorkspace();
            if (!r.ok) setErr(r.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Setting up…" : "Create my workspace"}
      </Button>
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
    </div>
  );
}
