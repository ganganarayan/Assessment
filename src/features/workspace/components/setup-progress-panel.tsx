import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { SetupProgress } from "@/features/workspace/data/setup-progress";

/**
 * The four things a workspace has to do, with the ones already done marked off.
 *
 * It sits ABOVE the owner-authored steps, not instead of them: the authored list is the
 * narrative ("here is how this product is meant to be used") and this is the state
 * ("here is where you are"). They answer different questions, and the one a returning
 * tenant opens the dashboard with is this one.
 *
 * 🟢 IT DISAPPEARS WHEN IT IS DONE. A setup panel that stays forever is the reason
 * people stop reading the top of a dashboard, and every line here is derived, so
 * "finished" is a fact rather than a tick somebody remembered to click.
 *
 * Only the FIRST outstanding step gets a button. Four live buttons is a menu, and the
 * order matters: publishing before the pixel is set is how a funnel goes live reporting
 * to nobody.
 */
export function SetupProgressPanel({ progress }: { progress: SetupProgress | null }) {
  if (!progress || progress.complete) return null;

  const total = progress.steps.length;
  const next = progress.steps.find((s) => !s.done) ?? null;

  return (
    <Card className="border-green-600/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-lg">Finish setting up</CardTitle>
          <span className="text-sm text-[var(--muted-foreground)]">
            {progress.doneCount} of {total} done
          </span>
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]"
          role="img"
          aria-label={`Setup: ${progress.doneCount} of ${total} steps done`}
        >
          <div
            className="h-full rounded-full bg-green-600"
            style={{ width: `${Math.max(Math.round((progress.doneCount / total) * 100), 2)}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ol className="flex flex-col gap-3">
          {progress.steps.map((s) => {
            const isNext = next?.key === s.key;
            return (
              <li key={s.key} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    s.done
                      ? "bg-green-600 text-white"
                      : isNext
                        ? "border-2 border-green-600 text-green-700"
                        : "border border-[var(--border)] text-[var(--muted-foreground)]"
                  }`}
                >
                  {s.done ? "✓" : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${s.done ? "text-[var(--muted-foreground)] line-through" : "font-medium"}`}>
                    {s.label}
                  </p>
                  {/* The why only appears on the step they are actually on. On a done
                      step it is history, and on a later one it is reading ahead. */}
                  {isNext ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">{s.todo}</p>
                  ) : null}
                </div>
                {isNext ? (
                  <Link href={s.href} className={`${buttonVariants({ size: "sm" })} shrink-0 self-start`}>
                    {s.cta}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
