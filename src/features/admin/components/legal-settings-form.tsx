"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLegalSettings, type LegalSettingsView } from "@/features/admin/actions/platform-integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Platform legal / company details — the ONE place the company's identity is edited.
 *
 * These appear on the public policy pages (/privacy, /terms, /refund) and, since the SEO
 * work, in the public JSON-LD Organization that search and AI answer engines read. The
 * two surfaces treat a blank field differently on purpose: a policy page shows a visible
 * "set this in Settings" placeholder, while the structured data OMITS the property —
 * publishing a placeholder as a registered name is worse than publishing nothing.
 */
export function LegalSettingsForm({ initial }: { initial: LegalSettingsView }) {
  const router = useRouter();
  const [v, setV] = useState<LegalSettingsView>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof LegalSettingsView>(k: K, val: string) =>
    setV((prev) => ({ ...prev, [k]: val }));

  function save() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await updateLegalSettings(v);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setMsg("Saved. The policy pages now show these details.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="legalEntityName">Legal entity name</Label>
        <Input
          id="legalEntityName"
          placeholder="e.g. Divine Leads Private Limited"
          value={v.entityName}
          onChange={(e) => set("entityName", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="legalAddress">Registered address</Label>
        <Textarea
          id="legalAddress"
          placeholder="Street, city, state, PIN, India"
          value={v.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="legalGstin">GSTIN</Label>
          <Input
            id="legalGstin"
            placeholder="22AAAAA0000A1Z5"
            value={v.gstin}
            onChange={(e) => set("gstin", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="legalFoundedOn">Founded (year-month)</Label>
          <Input
            id="legalFoundedOn"
            placeholder="2024-02"
            value={v.foundedOn}
            onChange={(e) => set("foundedOn", e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="legalContactEmail">Public contact email</Label>
          <Input
            id="legalContactEmail"
            type="email"
            placeholder="support@yourdomain.com"
            value={v.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="legalGoverningLocation">Governing-law city / state</Label>
          <Input
            id="legalGoverningLocation"
            placeholder="e.g. Bengaluru, Karnataka"
            value={v.governingLocation}
            onChange={(e) => set("governingLocation", e.target.value)}
          />
        </div>
      </div>
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
      {msg ? <p className="text-sm text-green-600">{msg}</p> : null}
      <div>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save legal details"}
        </Button>
      </div>
    </div>
  );
}
