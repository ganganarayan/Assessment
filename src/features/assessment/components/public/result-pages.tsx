"use client";

import { Button } from "@/components/ui/button";
import {
  type AssessmentPageData,
  type PageBlockData,
  type BandLevel,
} from "@/features/assessment/pages/blocks";
import { VideoPlayer } from "@/features/assessment/components/public/video-player";

export interface ResultForPages {
  overallBandTitle: string | null;
  overallBandLevel: string | null;
  /** score/max are null while a required payment is unpaid (the server withholds them). */
  categories: { name: string; band: string | null; score: number | null; max: number | null }[];
  /** True while a required payment is unpaid: the breakdown shows a blurred placeholder. */
  scoresLocked: boolean;
  /** The respondent's AI statement, written at submit. Null when none was generated. */
  aiStatement: string | null;
  // VidaPulse identity bridge (see @/lib/vidapulse): carried into the video embed src.
  customerId: string | null;
  vidapulseParam: string | null;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Renders the configured post-assessment pages + blocks. Static blocks (text /
 * video / pay button) come from config; dynamic blocks (overall band / band
 * sentence / category breakdown / AI statement) come from the respondent's result.
 * Category scores blur ONLY while a required payment is unpaid; that decision is the
 * server's (getResultForPages), which withholds the numbers in that case. A funnel
 * with no payment shows the real scores.
 */
export function ResultPages({
  pages,
  result,
  onPay,
  payPending,
  payError,
}: {
  pages: AssessmentPageData[];
  result: ResultForPages;
  onPay: () => void;
  payPending: boolean;
  payError: string | null;
}) {
  return (
    <div className="flex flex-col gap-10">
      {pages.map((page) => (
        <div key={page.id} className="flex flex-col gap-6">
          {page.blocks.map((b) => (
            <Block key={b.id} block={b} result={result} onPay={onPay} payPending={payPending} payError={payError} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Block({
  block,
  result,
  onPay,
  payPending,
  payError,
}: {
  block: PageBlockData;
  result: ResultForPages;
  onPay: () => void;
  payPending: boolean;
  payError: string | null;
}) {
  const c = block.config ?? {};
  switch (block.type) {
    case "text": {
      const heading = str(c.heading);
      const content = str(c.content);
      return (
        <div className="flex flex-col gap-2">
          {heading ? <h2 className="text-xl font-semibold">{heading}</h2> : null}
          {content ? <p className="whitespace-pre-line text-[var(--muted-foreground)]">{content}</p> : null}
        </div>
      );
    }
    case "video": {
      // A URL or an embed code, played as whatever it actually is. This block used to
      // assume an embeddable URL and frame it, so an mp4 or an HLS playlist pasted here
      // was a grey box.
      return (
        <div className="w-full">
          <VideoPlayer
            source={str(c.embedUrl)}
            vidapulseParam={result.vidapulseParam}
            customerId={result.customerId}
          />
        </div>
      );
    }
    case "pay_button": {
      const label = str(c.label) || "Pay to unlock";
      return (
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={onPay} disabled={payPending}>
            {payPending ? "Opening payment…" : label}
          </Button>
          {payError ? <p className="text-sm text-red-500">{payError}</p> : null}
        </div>
      );
    }
    case "overall_band": {
      const prefix = str(c.prefix);
      return (
        <p className="text-center text-lg">
          {prefix ? <span className="text-[var(--muted-foreground)]">{prefix} </span> : null}
          <strong className="text-2xl" data-qa-band={result.overallBandTitle ?? ""}>{result.overallBandTitle ?? "-"}</strong>
        </p>
      );
    }
    case "band_sentence": {
      const byBand = (c.byBand ?? {}) as Partial<Record<BandLevel, string>>;
      const level = (result.overallBandLevel ?? "") as BandLevel;
      const sentence = byBand[level];
      if (!sentence) return null;
      return <p className="whitespace-pre-line text-center text-[var(--muted-foreground)]">{sentence}</p>;
    }
    case "category_scores": {
      const heading = str(c.heading);
      return (
        <div className="flex flex-col gap-2">
          {heading ? <h3 className="font-semibold">{heading}</h3> : null}
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {result.categories.map((cat) => (
                  <tr key={cat.name}>
                    <td className="px-3 py-2">{cat.name}</td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">{cat.band ?? "-"}</td>
                    <td className="px-3 py-2 text-right">
                      {result.scoresLocked || cat.score === null || cat.max === null ? (
                        // Real score is never sent while payment is due - blurred placeholder.
                        <span className="select-none blur-sm tabular-nums" aria-hidden>88 / 100</span>
                      ) : (
                        <span className="tabular-nums" data-qa-score={cat.name}>
                          {percentOf(cat.score, cat.max)} / 100
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    case "ai_statement": {
      // No fallback text by design: the statement is generated at submit, and the one
      // way it is missing (provider credits exhausted) alerts the platform owners.
      const body = result.aiStatement?.trim();
      if (!body) return null;
      return (
        <div className="whitespace-pre-line leading-relaxed" data-qa-ai-statement>
          {body}
        </div>
      );
    }
    default:
      return null;
  }
}

/** Integer percentage, the same scale the bands are cut on. */
function percentOf(score: number, max: number): number {
  return max > 0 ? Math.round((score / max) * 100) : 0;
}
