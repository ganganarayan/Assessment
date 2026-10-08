import {
  PLATFORM_SUPPORT_EMAIL,
  PLATFORM_SUPPORT_WHATSAPP,
  PLATFORM_SUPPORT_WHATSAPP_LINK,
} from "@/lib/platform-support";

/**
 * The standing offer, on every workspace screen during a trial.
 *
 * The welcome dialog says this once and then stops after five logins. This is what
 * remains: the same offer, always reachable, costing one line. A trial customer who
 * decides on day nine that they want help should not have to remember an address from
 * a dialog they dismissed on day one.
 *
 * Trial only. A paying customer has a relationship and does not need a permanent strip
 * asking them to get started, and a parked one is already looking at the paused panel,
 * which carries the same contacts. Shown to everyone forever, this would be furniture
 * within a week.
 *
 * A server component with no state: it must be right on first paint, and there is
 * nothing here worth a client bundle.
 */
export function SupportStrip() {
  return (
    <div className="border-b border-green-600/30 bg-green-600/10 px-4 py-2 text-center text-sm">
      <span className="text-[var(--muted-foreground)]">
        Get your lead-qualifying engine up in 30 minutes - contact support{" "}
      </span>
      <a href={`mailto:${PLATFORM_SUPPORT_EMAIL}`} className="font-medium underline">
        {PLATFORM_SUPPORT_EMAIL}
      </a>
      <span className="text-[var(--muted-foreground)]"> or WhatsApp </span>
      <a
        href={PLATFORM_SUPPORT_WHATSAPP_LINK}
        target="_blank"
        rel="noreferrer"
        className="font-medium underline"
      >
        {PLATFORM_SUPPORT_WHATSAPP}
      </a>
    </div>
  );
}
