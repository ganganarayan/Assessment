import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Banner shown on Stats/Submissions/Contacts/Data-window when scoped to one
 *  assessment (via ?assessment=<id>). Links back to the global (all-assessments) view. */
export function AssessmentScopeBar({
  assessmentTitle,
  allHref,
}: {
  assessmentTitle: string;
  allHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--primary)]/40 bg-[var(--primary)]/5 px-4 py-2 text-sm">
      <span>
        Scoped to assessment: <strong>{assessmentTitle}</strong>
      </span>
      <Link href={allHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
        ← All assessments
      </Link>
    </div>
  );
}
