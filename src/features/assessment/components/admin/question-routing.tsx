"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setQuestionRoutes } from "@/features/assessment/actions/routing";
import type {
  QuestionRouteInput,
  RouteActionValue,
} from "@/features/assessment/schemas";
import { Button } from "@/components/ui/button";

/** One question's place in the flow, for building forward-only destinations. */
export interface FlowQuestion {
  id: string;
  index: number;
  /** Short label like "Q3 · How often…". */
  label: string;
}
export interface FlowCategory {
  id: string;
  name: string;
  /** Spine index of this category's first question. */
  firstIndex: number;
}

export interface RoutingOption {
  id: string;
  label: string;
  route: {
    action: RouteActionValue;
    targetQuestionId: string | null;
    targetCategoryId: string | null;
  } | null;
}

/** Encode a route as a single <select> value; decode on save. */
function encode(route: RoutingOption["route"]): string {
  if (!route || route.action === "NEXT") return "next";
  if (route.action === "SKIP_TO_END") return "end";
  if (route.action === "JUMP_TO_QUESTION" && route.targetQuestionId) return `q:${route.targetQuestionId}`;
  if (route.action === "JUMP_TO_CATEGORY" && route.targetCategoryId) return `c:${route.targetCategoryId}`;
  return "next";
}

function decode(value: string): Omit<QuestionRouteInput, "optionId"> {
  if (value === "end") return { action: "SKIP_TO_END", targetQuestionId: "", targetCategoryId: "" };
  if (value.startsWith("q:")) return { action: "JUMP_TO_QUESTION", targetQuestionId: value.slice(2), targetCategoryId: "" };
  if (value.startsWith("c:")) return { action: "JUMP_TO_CATEGORY", targetQuestionId: "", targetCategoryId: value.slice(2) };
  return { action: "NEXT", targetQuestionId: "", targetCategoryId: "" };
}

/**
 * Per-question conditional-routing editor: pick, for each answer option, where the
 * flow goes when that option is chosen. Only forward destinations are offered
 * (guarantees no loops). Routing runs in the SINGLE (one-question-per-page)
 * display mode; a note is shown when the assessment is set to another mode.
 */
export function QuestionRoutingEditor({
  questionId,
  options,
  flow,
  categoriesFlow,
  displayMode,
  onDone,
}: {
  questionId: string;
  options: RoutingOption[];
  flow: FlowQuestion[];
  categoriesFlow: FlowCategory[];
  displayMode: "ALL" | "CATEGORY" | "SINGLE";
  onDone: () => void;
}) {
  const router = useRouter();
  const currentIndex = flow.find((f) => f.id === questionId)?.index ?? -1;
  const laterQuestions = flow.filter((f) => f.index > currentIndex);
  const laterCategories = categoriesFlow.filter((c) => c.firstIndex > currentIndex);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(options.map((o) => [o.id, encode(o.route)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    const routes: QuestionRouteInput[] = options.map((o) => ({
      optionId: o.id,
      ...decode(values[o.id] ?? "next"),
    }));
    start(async () => {
      const res = await setQuestionRoutes(questionId, { routes });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  const hasForward = laterQuestions.length > 0 || laterCategories.length > 0;

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border border-dashed bg-[var(--muted)]/40 p-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Conditional routing</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          When an answer is chosen, decide where the respondent goes next. Only
          later questions are offered, so a flow can never loop.
          {displayMode !== "SINGLE" ? (
            <>
              {" "}
              <strong>Note:</strong> routing runs only in the{" "}
              <em>“one question per page”</em> display mode. Set the assessment to that
              mode for these rules to take effect.
            </>
          ) : null}
        </p>
      </div>

      {!hasForward ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          This is the last question in the flow — there is nowhere forward to route to.
          You can still send an answer straight to the results.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <div key={o.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="text-sm">{o.label || <em className="text-[var(--muted-foreground)]">(unlabelled option)</em>}</span>
            <select
              value={values[o.id] ?? "next"}
              onChange={(e) => setValues((v) => ({ ...v, [o.id]: e.target.value }))}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm sm:max-w-xs"
            >
              <option value="next">Continue to next question</option>
              {laterQuestions.length > 0 ? (
                <optgroup label="Jump to question">
                  {laterQuestions.map((q) => (
                    <option key={q.id} value={`q:${q.id}`}>{q.label}</option>
                  ))}
                </optgroup>
              ) : null}
              {laterCategories.length > 0 ? (
                <optgroup label="Jump to category">
                  {laterCategories.map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
                  ))}
                </optgroup>
              ) : null}
              <option value="end">Skip to results (end)</option>
            </select>
          </div>
        ))}
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save routing"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Close
        </Button>
      </div>
    </div>
  );
}
