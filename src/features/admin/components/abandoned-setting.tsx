"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAbandonedHours } from "@/features/events/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AbandonedSetting({ hours }: { hours: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(hours));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await updateAbandonedHours(Number(value));
      if (!res.ok) return setErr(res.error);
      setMsg("Saved.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Input
          type="number"
          min={1}
          max={8760}
          className="w-28"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {err ? <span className="text-sm text-red-500">{err}</span> : null}
      {msg ? <span className="text-sm text-emerald-600">{msg}</span> : null}
    </div>
  );
}
