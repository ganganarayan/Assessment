"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FunnelLinks } from "@/features/assessment/components/funnel-links";
import { acknowledgeAdLink } from "@/features/onboarding/actions";

/**
 * WHAT HAPPENS THE MOMENT A FUNNEL GOES LIVE.
 *
 * Publishing used to be a button that turned a badge from DRAFT to LIVE and said nothing
 * else, which left the one thing publishing is FOR - the link - to be hunted down
 * afterwards on a different screen. So the act of publishing now hands over both links
 * at once: the preview to walk it with, and the public one for the ad.
 *
 * It appears for ANY publish, by anybody, not only the first: the link is what somebody
 * came for every time, and a dialog that only ever showed up once would be missing on
 * exactly the publish that followed a change worth re-testing.
 *
 * It is the builder's own feedback and works for a workspace that finished its setup
 * months ago. It is also JOINED to the guided setup: the sequence has a step for exactly
 * this, so acknowledging here answers it and, for somebody still being set up, hands
 * them on to the screens that say where their numbers and leads live. Two dialogs saying
 * the same thing at the same moment is what that avoids.
 */
export function PublishedDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  /**
   * Closing is also the answer to the sequence's own "have you copied it" step, and when
   * the workspace is still being set up it hands them on to the three screens that say
   * where the numbers, the leads and the data window live. A workspace that never started
   * the sequence - or the platform owner on /admin - simply closes.
   */
  async function done() {
    if (busy) return;
    setBusy(true);
    const r = await acknowledgeAdLink();
    setBusy(false);
    onClose();
    if (r.resume) router.push("/w/start");
  }

  // Escape closes it. A dialog with one way out is a dialog somebody feels stuck in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="published-title"
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl sm:max-w-lg sm:rounded-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="published-title" className="text-xl font-bold tracking-tight">
            It is live.
          </h2>
          <button
            type="button"
            onClick={() => void done()}
            disabled={busy}
            className="text-xs underline text-[var(--muted-foreground)]"
          >
            Close
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
          Two links, and they are not the same thing: test with the first, advertise the second.
        </p>
        <div className="mt-4">
          <FunnelLinks slug={slug} onDone={() => void done()} />
        </div>
      </div>
    </div>
  );
}
