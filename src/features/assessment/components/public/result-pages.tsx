"use client";

import { Button } from "@/components/ui/button";
import {
  type AssessmentPageData,
  type PageBlockData,
  type BandLevel,
} from "@/features/assessment/pages/blocks";

export interface ResultForPages {
  overallBandTitle: string | null;
  overallBandLevel: string | null;
  categories: { name: string; band: string | null }[];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const isHttp = (u: string) => /^https?:\/\//i.test(u);

/**
 * Renders the configured post-assessment pages + blocks. Static blocks (text /
 * video / pay button) come from config; dynamic blocks (overall band / band
 * sentence / category breakdown) come from the respondent's result. Category
 * scores are intentionally BLURRED placeholders — the real numbers only appear on
 * the destination/VSL after payment.
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
      const url = str(c.embedUrl);
      if (!isHttp(url)) return null;
      return (
        <div className="aspect-video w-full overflow-hidden rounded-lg border">
          <iframe
            src={url}
            className="h-full w-full"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            title="Video"
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
          <strong className="text-2xl">{result.overallBandTitle ?? "—"}</strong>
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
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">{cat.band ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {/* Real score is never sent — blurred placeholder until paid. */}
                      <span className="select-none blur-sm tabular-nums" aria-hidden>88 / 100</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
