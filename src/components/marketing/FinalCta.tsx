import { buttonVariants } from "@/components/ui/button";
import { getCta } from "@/lib/settings/cta";
import { CtaLink } from "./CtaLink";

export async function FinalCta() {
  const cta = await getCta();

  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="rounded-2xl bg-[var(--foreground)] px-8 py-16 text-center sm:px-12">
          <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-[var(--background)] sm:text-3xl">
            Stop opening calls cold. Know who&apos;s ready before you make one.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--background)] opacity-70">
            Build your first scorecard in minutes and let fit decide who gets a call.
          </p>
          <CtaLink href={cta.href} className={cnLg}>
            {cta.trialLabel}
          </CtaLink>
        </div>
      </div>
    </section>
  );
}

const cnLg = `mt-8 ${buttonVariants({ size: "lg" })}`;
