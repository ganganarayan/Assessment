"use client";

import { useState, useTransition } from "react";
import { updateBrandLegal, uploadBrandImage } from "@/features/workspace/actions/brand-legal";
import { type BrandImageKind, type BrandLegal } from "@/features/workspace/brand-legal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Fields = Omit<BrandLegal, "isPlatform">;

const IMAGES: Array<{ kind: BrandImageKind; field: "logoUrl" | "faviconUrl" | "shareImageUrl"; label: string; help: string }> = [
  { kind: "logo", field: "logoUrl", label: "Logo", help: "Shown on your checkout and your PDF reports. PNG or JPEG prints in the PDF." },
  { kind: "favicon", field: "faviconUrl", label: "Browser tab icon (favicon)", help: "A small square image, 64 x 64 or larger." },
  { kind: "share", field: "shareImageUrl", label: "Share image", help: "The picture shown when a funnel link is shared, if the funnel has no cover image. 1200 x 630 works best." },
];

export function BrandLegalForm({ initial }: { initial: BrandLegal }) {
  const { isPlatform, ...start } = initial;
  const [v, setV] = useState<Fields>(start);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, run] = useTransition();
  const [uploading, setUploading] = useState<BrandImageKind | null>(null);

  const set = (k: keyof Fields, value: string) => setV((p) => ({ ...p, [k]: value }));

  function save() {
    setMsg(null);
    run(async () => {
      const res = await updateBrandLegal(v);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  async function upload(kind: BrandImageKind, field: "logoUrl" | "faviconUrl" | "shareImageUrl", file: File | undefined) {
    if (!file) return;
    setMsg(null);
    setUploading(kind);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file);
    const res = await uploadBrandImage(fd);
    setUploading(null);
    if (res.ok) {
      set(field, res.url);
      setMsg({ ok: true, text: "Uploaded. Click Save to use it." });
    } else {
      setMsg({ ok: false, text: res.error });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {!isPlatform
        ? IMAGES.map((img) => (
            <div key={img.kind} className="flex flex-col gap-2">
              <Label htmlFor={`brand-${img.kind}`}>{img.label}</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id={`brand-${img.kind}`}
                  placeholder="https://"
                  value={v[img.field]}
                  onChange={(e) => set(img.field, e.target.value)}
                />
                <label className="inline-flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm whitespace-nowrap">
                  {uploading === img.kind ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/x-icon"
                    className="sr-only"
                    disabled={uploading !== null}
                    onChange={(e) => void upload(img.kind, img.field, e.target.files?.[0])}
                  />
                </label>
              </div>
              {v[img.field] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v[img.field]} alt="" className="h-10 w-auto max-w-[160px] rounded border object-contain" />
              ) : null}
              <p className="text-xs text-[var(--muted-foreground)]">{img.help}</p>
            </div>
          ))
        : null}

      {!isPlatform ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brand-privacy">Privacy policy link</Label>
            <Input id="brand-privacy" placeholder="https://yourbrand.com/privacy" value={v.privacyUrl} onChange={(e) => set("privacyUrl", e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brand-terms">Terms link</Label>
            <Input id="brand-terms" placeholder="https://yourbrand.com/terms" value={v.termsUrl} onChange={(e) => set("termsUrl", e.target.value)} />
            <p className="text-xs text-[var(--muted-foreground)]">
              Linked at the foot of your funnels, result pages and booking pages. Leave blank to show no link.
            </p>
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="brand-replyto">Reply-to email</Label>
        <Input id="brand-replyto" type="email" placeholder="hello@yourbrand.com" value={v.replyToEmail} onChange={(e) => set("replyToEmail", e.target.value)} />
        <p className="text-xs text-[var(--muted-foreground)]">When someone replies to an email you send them, the reply goes here. Blank = the sending address.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="brand-disclaimer">PDF closing line</Label>
        <Textarea
          id="brand-disclaimer"
          rows={2}
          placeholder="This report is an indicative self-assessment based on your answers."
          value={v.reportDisclaimer}
          onChange={(e) => set("reportDisclaimer", e.target.value)}
        />
        <p className="text-xs text-[var(--muted-foreground)]">Printed under every page of the PDF report. Blank = the line shown above.</p>
      </div>

      {msg ? <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p> : null}
      <div>
        <Button size="sm" onClick={save} disabled={pending || uploading !== null}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
