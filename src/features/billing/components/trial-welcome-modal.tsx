"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PLATFORM_SUPPORT_EMAIL,
  PLATFORM_SUPPORT_WHATSAPP,
  PLATFORM_SUPPORT_WHATSAPP_LINK,
} from "@/lib/platform-support";

/**
 * The first thing a new workspace sees, and the only thing it can interact with.
 *
 * WHY IT BLOCKS. The offer behind it - a 30-minute call that gets their funnel live -
 * is the single highest-value thing a trial can do, and it is worth nothing if it
 * scrolls past as one more banner. A trial is lost in the first week by someone who
 * never published anything, so this is the one moment where interrupting is the kinder
 * option. The tick is there so the interruption registers as a decision rather than a
 * reflex.
 *
 * WHY IT STOPS. Five logins. Long enough that somebody who skimmed it the first time
 * meets it again, short enough that it has stopped before it becomes the thing they
 * resent about the product. The count comes from `User.loginCount`, which is stamped on
 * sign-in, so "five logins" means five, not five page loads.
 *
 * WHY ONCE PER LOGIN. Remembered in localStorage against the login number, so it does
 * not reappear on every navigation within a visit, and does reappear on the next
 * sign-in - which is what "the first five times" has to mean. Storage can be blocked or
 * cleared, so a read that throws degrades to SHOWING it: an extra appearance is a
 * nuisance, a missed one loses the offer.
 *
 * It is not a licence agreement and does not pretend to be: the tick says "I have read
 * and understood", nothing is consented to, and nothing is recorded server-side.
 */

const KEY_PREFIX = "a360.trialWelcome.v1.";

export function TrialWelcomeModal({
  loginCount,
  trialDaysLeft,
}: {
  loginCount: number;
  trialDaysLeft: number;
}) {
  // Start hidden and decide on the client. Rendering it during SSR would flash a
  // blocking overlay at somebody who has already dismissed it for this login.
  const [show, setShow] = useState(false);
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(`${KEY_PREFIX}${loginCount}`) === "1";
    } catch {
      // Private window, blocked storage, cleared site data. Show it.
      seen = false;
    }
    setShow(!seen);
  }, [loginCount]);

  // Nothing behind it scrolls while it is up. Without this the page moves under a
  // dialog that is supposed to be holding everything still.
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  if (!show) return null;

  function accept() {
    try {
      window.localStorage.setItem(`${KEY_PREFIX}${loginCount}`, "1");
    } catch {
      // Not being able to remember it is not a reason to refuse to close it.
    }
    setShow(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-welcome-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-2xl">
        <h2 id="trial-welcome-title" className="text-xl font-bold tracking-tight">
          Congratulations!
        </h2>

        <p className="mt-3 text-sm font-semibold">Speed wins.</p>

        <p className="mt-2 text-sm leading-relaxed">
          Please check your email and WhatsApp, and <strong>reply</strong>. Support will help you set up
          your lead-qualifying engine in a 30-minute Zoom call, and you can win a qualified sale inside
          your {trialDaysLeft > 0 ? `${trialDaysLeft}-day` : "14-day"} trial.
        </p>

        <div className="mt-4 rounded-lg border bg-[var(--muted)]/40 p-3 text-sm">
          <p className="font-medium">Reach support any time</p>
          <p className="mt-1 text-[var(--muted-foreground)]">
            <a href={`mailto:${PLATFORM_SUPPORT_EMAIL}`} className="underline">
              {PLATFORM_SUPPORT_EMAIL}
            </a>{" "}
            · WhatsApp{" "}
            <a href={PLATFORM_SUPPORT_WHATSAPP_LINK} target="_blank" rel="noreferrer" className="underline">
              {PLATFORM_SUPPORT_WHATSAPP}
            </a>
          </p>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
          />
          <span>I have read and understood. Open my dashboard.</span>
        </label>

        <Button className="mt-4 w-full" disabled={!understood} onClick={accept}>
          OK
        </Button>
      </div>
    </div>
  );
}
