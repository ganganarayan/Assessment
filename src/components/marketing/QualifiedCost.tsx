import { QUALIFIED_COST } from "@/lib/marketing/content";
import { getCta } from "@/lib/settings/cta";
import { detectCurrency } from "@/lib/marketing/region";
import { QualifiedLeadCalculator } from "./QualifiedLeadCalculator";

/**
 * Section three: the reader's own numbers, straight after the itemised bill.
 *
 * DisqualifiedCost says a wrong lead is expensive; this lets the reader price their own.
 * The anchor #calculator is what the flashing badge in the nav scrolls to.
 */
export async function QualifiedCost() {
  const [cta, { currency, resolved }] = await Promise.all([getCta(), detectCurrency()]);
  return (
    <section id="calculator" className="scroll-mt-40 border-b">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-green-600">{QUALIFIED_COST.eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{QUALIFIED_COST.heading}</h2>
          <p className="mt-4 text-lg text-[var(--muted-foreground)]">{QUALIFIED_COST.lead}</p>
        </div>
        <div className="mt-8">
          <QualifiedLeadCalculator cta={cta} currency={currency} currencyResolved={resolved} />
        </div>
      </div>
    </section>
  );
}
