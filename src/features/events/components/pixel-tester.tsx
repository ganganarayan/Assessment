"use client";

import { useRef, useState } from "react";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Meta standard events use track(); anything else (e.g. AssessmentCompleted) uses trackCustom(). */
const STANDARD_EVENTS = new Set([
  "PageView", "ViewContent", "Search", "AddToCart", "AddToWishlist", "InitiateCheckout",
  "AddPaymentInfo", "Purchase", "Lead", "CompleteRegistration", "Contact", "CustomizeProduct",
  "Donate", "FindLocation", "Schedule", "StartTrial", "SubmitApplication", "Subscribe",
]);

type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: unknown;
  loaded: boolean;
  version: string;
};

/** Inject the Meta Pixel base library once (this admin page has no pixel by default). */
function loadFbevents(): void {
  const w = window as unknown as { fbq?: FbqFn; _fbq?: FbqFn };
  if (w.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as FbqFn;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  w.fbq = fbq;
  if (!w._fbq) w._fbq = fbq;
  const t = document.createElement("script");
  t.async = true;
  t.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(t);
}

export function PixelTester() {
  const [pixelId, setPixelId] = useState(env.NEXT_PUBLIC_META_PIXEL_ID ?? "");
  const [eventName, setEventName] = useState("PageView");
  const [log, setLog] = useState<string[]>([]);
  const initedId = useRef<string | null>(null);

  function fire() {
    const id = pixelId.trim();
    const ev = eventName.trim();
    if (!id || !ev) {
      setLog((l) => ["⚠ Enter both a Pixel ID and an Event name.", ...l]);
      return;
    }
    loadFbevents();
    const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
    if (!fbq) {
      setLog((l) => ["⚠ Pixel failed to load (ad blocker?).", ...l]);
      return;
    }
    if (initedId.current !== id) {
      fbq("init", id);
      initedId.current = id;
    }
    const kind = STANDARD_EVENTS.has(ev) ? "track" : "trackCustom";
    fbq(kind, ev);
    const ts = new Date().toISOString().slice(11, 19);
    setLog((l) => [`${ts}  ${kind}("${ev}") → pixel ${id}`, ...l].slice(0, 50));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
        <Input
          className="sm:w-56"
          value={pixelId}
          onChange={(e) => setPixelId(e.target.value)}
          placeholder="Pixel ID"
        />
        <Input
          className="sm:flex-1"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="Event (e.g. PageView, AssessmentCompleted)"
          onKeyDown={(e) => {
            if (e.key === "Enter") fire();
          }}
        />
        <Button onClick={fire} disabled={!pixelId.trim() || !eventName.trim()}>
          Fire
        </Button>
      </div>

      {log.length > 0 ? (
        <pre className="max-h-72 overflow-auto rounded-md border bg-[var(--muted)] p-3 text-xs leading-relaxed">
          {log.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}
