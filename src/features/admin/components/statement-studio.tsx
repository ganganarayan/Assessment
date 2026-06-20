"use client";

import { useState, useTransition } from "react";
import { testAi, type PromptVersionView } from "@/features/admin/actions/ai-settings";
import { Button } from "@/components/ui/button";

type TestResult = { ok: boolean; ms: number; text?: string; error?: string };

/** The big, readable card respondents see above the video. */
function StatementCard({ text }: { text: string }) {
  return (
    <div className="rounded-lg border bg-[var(--muted)] p-4">
      <p className="whitespace-pre-line text-[1.05rem] leading-relaxed text-[var(--foreground)]">
        {text}
      </p>
    </div>
  );
}

function VersionPreview({ v, sampleName }: { v: PromptVersionView; sampleName: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<TestResult | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {v.label}
            {v.active ? (
              <span className="ml-2 rounded-full bg-cyan-600 px-2 py-0.5 text-xs font-medium text-white">
                Active
              </span>
            ) : null}
          </p>
          <p className="text-sm text-[var(--muted-foreground)]">{v.description}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => start(async () => setRes(await testAi(v.id)))}
        >
          {pending ? "Generating…" : `Generate sample (${sampleName})`}
        </Button>
      </div>

      <details>
        <summary className="cursor-pointer text-xs text-[var(--muted-foreground)]">
          View system prompt
        </summary>
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-[var(--muted)] p-2 text-xs text-[var(--foreground)]">
          {v.system}
        </pre>
      </details>

      {res ? (
        res.ok ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-green-600">Generated in {res.ms} ms (live model output):</p>
            <StatementCard text={res.text ?? "(empty response)"} />
          </div>
        ) : (
          <p className="text-sm text-red-500">
            Failed{res.ms ? ` after ${res.ms} ms` : ""}: {res.error}
          </p>
        )
      ) : null}
    </div>
  );
}

export function StatementStudio({
  versions,
  sampleName,
  sampleEasyRead,
}: {
  versions: PromptVersionView[];
  sampleName: string;
  sampleEasyRead: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div>
          <h3 className="font-semibold">Target example, easy read</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            How {sampleName}&apos;s result reads in the easy-read style — the framing real
            respondents see above your video.
          </p>
        </div>
        <StatementCard text={sampleEasyRead} />
      </div>

      <div className="flex flex-col gap-2">
        <div>
          <h3 className="font-semibold">Compare versions</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Generate the same {sampleName} result through each prompt version (needs a saved API
            key). Pick the winner above; remove the rest later.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          {versions.map((v) => (
            <VersionPreview key={v.id} v={v} sampleName={sampleName} />
          ))}
        </div>
      </div>
    </div>
  );
}
