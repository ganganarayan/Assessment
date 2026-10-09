"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { submitDfyRequest } from "@/features/marketing/actions/dfy";
import { EMPTY_DFY, type DfyInput } from "@/features/marketing/dfy-schema";
import { PLATFORM_SUPPORT_WHATSAPP_LINK } from "@/lib/platform-support";
import { DFY, OFFER } from "@/lib/marketing/content";

/**
 * The done-for-you intake.
 *
 * One page, no steps. A multi-step wizard would measure better on completion rate per
 * step and worse on the only number that matters here, because the person filling this
 * in has already decided - the form's job is to get out of the way, not to drip-feed.
 *
 * The free-text "who is a bad lead" field is deliberately the largest control on the
 * page. It is the one answer the gate is written from, and the rest can be inferred from
 * a website if someone leaves them thin.
 */
export function BuildForm() {
  const [v, setV] = useState<DfyInput>(EMPTY_DFY);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const set = <K extends keyof DfyInput>(k: K, value: DfyInput[K]) =>
    setV((prev) => ({ ...prev, [k]: value }));

  if (done) {
    return (
      <div className="rounded-2xl border bg-[var(--muted)] p-8 text-center">
        <h2 className="text-2xl font-bold tracking-tight">We will be in touch to book your call</h2>
        <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--muted-foreground)]">
          We have your details and a confirmation is on its way to your inbox. We will write the
          gate, the questions, the weights and the result bands, and bring the draft to a
          30-minute call where it goes live.
        </p>
        <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--muted-foreground)]">
          If you have a Meta pixel ID, or anything written down about who you do <em>not</em>{" "}
          want, reply to that email and we will fold it in.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href={PLATFORM_SUPPORT_WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-md bg-green-600 px-6 font-medium text-white"
          >
            Send us anything on WhatsApp
          </a>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-md border px-6 font-medium"
          >
            Back to the home page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await submitDfyRequest(v);
          if (r.ok) setDone(true);
          else setError(r.error);
        });
      }}
    >
      <Field id="business" label="Business name">
        <Input id="business" value={v.business} onChange={(e) => set("business", e.target.value)} />
      </Field>

      <Field id="website" label="Website" hint="Optional, but it saves us a round of questions.">
        <Input
          id="website"
          inputMode="url"
          placeholder="yourbusiness.com"
          value={v.website ?? ""}
          onChange={(e) => set("website", e.target.value)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="email" label="Email">
          <Input
            id="email"
            type="email"
            inputMode="email"
            value={v.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field id="whatsapp" label="WhatsApp number" hint="With country code.">
          <Input
            id="whatsapp"
            inputMode="tel"
            placeholder="+91 98765 43210"
            value={v.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
          />
        </Field>
      </div>

      <Field id="sells" label="What do you sell?">
        <Input
          id="sells"
          placeholder="Six-month business coaching programme"
          value={v.sells}
          onChange={(e) => set("sells", e.target.value)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="pricePoint" label="What does it cost?" hint="A range is fine.">
          <Input
            id="pricePoint"
            placeholder="$2,000 - $5,000"
            value={v.pricePoint}
            onChange={(e) => set("pricePoint", e.target.value)}
          />
        </Field>
        <Field id="trafficSource" label="Where does your traffic come from?">
          <Input
            id="trafficSource"
            placeholder="Meta ads, referrals, Instagram"
            value={v.trafficSource}
            onChange={(e) => set("trafficSource", e.target.value)}
          />
        </Field>
      </div>

      <Field id="monthlyLeads" label="Roughly how many leads a month right now?">
        <Input
          id="monthlyLeads"
          placeholder="About 120, of which maybe 15 are worth a call"
          value={v.monthlyLeads}
          onChange={(e) => set("monthlyLeads", e.target.value)}
        />
      </Field>

      {/* The one that writes the gate. Given its own panel because on a form of ten
          identical boxes, the most important question looks exactly like the least. */}
      <div className="rounded-xl border-2 border-green-600/40 bg-green-600/5 p-5">
        <Field
          id="badLead"
          label="Who is a BAD lead for you?"
          hint="The most useful thing on this form. Who wastes your time, what do they say on the call, and what would you have wanted to know before you took it?"
        >
          <Textarea
            id="badLead"
            rows={5}
            placeholder="People who want it but cannot pay in the next 90 days. Anyone still deciding whether to start a business at all. Students looking for free advice."
            value={v.badLead}
            onChange={(e) => set("badLead", e.target.value)}
          />
        </Field>
      </div>

      <Field
        id="calendarLink"
        label="Your calendar link"
        hint="Optional. Where a qualified lead should book, if you have one."
      >
        <Input
          id="calendarLink"
          value={v.calendarLink ?? ""}
          onChange={(e) => set("calendarLink", e.target.value)}
        />
      </Field>

      <label className="flex items-start gap-3 rounded-lg border p-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={v.adAccountAccess}
          onChange={(e) => set("adAccountAccess", e.target.checked)}
        />
        <span>
          I can give access to my ad account.
          <span className="block text-[var(--muted-foreground)]">
            Only needed if you want the exclusion audience and the qualified-only event wired
            up for you. The scorecard works without it.
          </span>
        </span>
      </label>

      {error ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{error}</p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending..." : DFY.cta}
      </Button>
      <p className="text-center text-sm font-medium">{OFFER.ctaSubline}</p>
      <p className="text-center text-sm text-[var(--muted-foreground)]">
        No card, no trial required.
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p className="text-sm text-[var(--muted-foreground)]">{hint}</p> : null}
      {children}
    </div>
  );
}
