"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWorkflow } from "@/features/workflows/actions";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  TRIGGER_LABEL,
  offerableTriggers,
  type WorkflowListRow,
} from "@/features/workflows/types";

/** The first way in, plus how many others. Never five labels in a row on a phone. */
function waysIn(triggers: WorkflowListRow["triggers"]): string {
  const first = triggers[0];
  if (!first) return "No way in yet";
  const label = TRIGGER_LABEL[first];
  return triggers.length === 1 ? label : `${label} + ${triggers.length - 1} more`;
}

/**
 * The list of sequences, and the one place a new one is started.
 *
 * Creating asks for a name and a trigger and nothing else, because those are the two
 * things that cannot be changed by looking at the thing afterwards. Everything else is
 * a decision better made with the sequence in front of you.
 */
export function WorkflowList({
  rows,
  basePath,
  isPlatform,
}: {
  rows: WorkflowListRow[];
  basePath: string;
  /**
   * 🔴 Platform scope sees the triggers that are about a WORKSPACE as well as the ones
   * about a lead. A tenant must not: offered "a workspace publishes a funnel" they
   * would build a sequence that can never fire for them, and nothing anywhere would
   * say why.
   */
  isPlatform: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const triggers = offerableTriggers(isPlatform);
  const [trigger, setTrigger] = useState<string>(triggers[0]!.value);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm font-medium">New sequence</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            placeholder="What it is for, e.g. Nurture after the scorecard"
            onChange={(e) => setName(e.target.value)}
          />
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] px-2 py-1 text-sm"
          >
            {triggers.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={pending || !name.trim()}
            onClick={() =>
              start(async () => {
                setMsg(null);
                const r = await createWorkflow({ name, trigger });
                if (!r.ok) setMsg(r.error);
                else if (r.data) router.push(`${basePath}/${r.data.id}`);
              })
            }
          >
            {pending ? "Creating..." : "Create"}
          </Button>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          {triggers.find((t) => t.value === trigger)?.hint}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          It starts as a draft. Nothing is sent until you publish it.
        </p>
        {msg ? <p className="text-sm text-red-500">{msg}</p> : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-[var(--muted-foreground)]">
          No sequences yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((w) => (
            <Link
              key={w.id}
              href={`${basePath}/${w.id}`}
              className="flex flex-col gap-1 rounded-lg border p-3 hover:bg-[var(--muted)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{w.name}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[w.status]}`}>
                  {STATUS_LABEL[w.status]}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                {waysIn(w.triggers)}{" "}
                · {w.stepCount} step{w.stepCount === 1 ? "" : "s"} ·{" "}
                {w.activeRuns} partway through · created {w.createdAt} IST
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
