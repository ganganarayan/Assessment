/**
 * Every Meta event name this app can send, in one place.
 *
 * WHY IT EXISTS. The CAPI tester asked the operator to type the event name, which means
 * knowing it from memory: "AssessmentCompleted" or "AssessmentComplete", "GateQualified"
 * or the "GatePassed" it was renamed from, and whatever each booking type and each
 * assessment was configured with. A typo there does not fail. It sends a REAL event under
 * a name nothing else uses, and Events Manager then shows a conversion that no funnel
 * will ever fire again, which is worse than no test at all.
 *
 * WHAT IS DERIVED RATHER THAN LISTED, and why that matters more than it looks: a list
 * copied by hand goes stale the first time somebody adds an event, and a stale list is
 * exactly the thing that sends the operator back to guessing.
 *
 *  - The FUNNEL events are read out of META_EVENT_META, the same table the assessment
 *    builder renders its per-event switches from. Add an event there and it appears here.
 *  - The CONFIGURED names (each booking type's four, each assessment's payment event, the
 *    high-ticket name) are read from the database per tenant by the caller, so the list
 *    shows what THIS workspace actually fires rather than what the defaults say.
 *  - Only Meta's own standard events are a literal list, because only Meta changes it.
 */
import { META_EVENT_KEYS, META_EVENT_META } from "@/features/assessment/meta-events";

/**
 * Meta's standard events. The browser pixel sends these with `track()` and anything else
 * with `trackCustom()`; the Conversions API takes either, so for the server-side test this
 * only decides whether the name is labelled standard or custom on screen.
 */
export const META_STANDARD_EVENTS: readonly string[] = [
  "PageView",
  "ViewContent",
  "Search",
  "AddToCart",
  "AddToWishlist",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
  "Lead",
  "CompleteRegistration",
  "Contact",
  "CustomizeProduct",
  "Donate",
  "FindLocation",
  "Schedule",
  "StartTrial",
  "SubmitApplication",
  "Subscribe",
] as const;

const STANDARD = new Set<string>(META_STANDARD_EVENTS);

export function isStandardMetaEvent(name: string): boolean {
  return STANDARD.has(name.trim());
}

export interface EventChoice {
  name: string;
  /** Shown beside the name, so the list explains itself instead of needing the docs. */
  note: string;
}

/**
 * The funnel's own events, from the builder's table.
 *
 * `META_EVENT_META[key].event` is written for a human ("AssessmentCompleted /
 * QualifiedCompletion" for the one moment that has two names depending on whether the
 * funnel is gated), so it is split rather than used whole. Splitting is deliberate and
 * the only parsing here: one entry per real event name, which is what a dropdown needs.
 */
export function funnelEventChoices(): EventChoice[] {
  const out: EventChoice[] = [];
  for (const key of META_EVENT_KEYS) {
    const meta = META_EVENT_META[key];
    for (const name of meta.event.split("/").map((s) => s.trim()).filter(Boolean)) {
      out.push({ name, note: meta.label });
    }
  }
  return out;
}

/**
 * The whole list, in the order an operator wants it: what this funnel fires, then what
 * this workspace has configured, then the rest of Meta's standard names.
 *
 * De-duplicated by name, FIRST note wins. That ordering is the point: "Purchase" is both
 * a Meta standard event and this app's payment conversion, and the sentence worth reading
 * next to it is the second one.
 */
export function buildEventChoices(configured: EventChoice[] = []): EventChoice[] {
  const seen = new Set<string>();
  const out: EventChoice[] = [];
  for (const c of [...funnelEventChoices(), ...configured, ...META_STANDARD_EVENTS.map((name) => ({ name, note: "Meta standard event" }))]) {
    const name = c.name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, note: c.note });
  }
  return out;
}
