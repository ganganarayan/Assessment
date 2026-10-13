"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameDoc, setDocSlug } from "@/features/result-pages/actions/docs";

/**
 * The page's name and slug, edited where the page is edited.
 *
 * Both are library metadata rather than content, so they save on their own button and
 * never touch the draft the builder below is auto-saving. The slug is not a public URL
 * - a respondent always arrives at /a/<assessment-slug>/r/<id> - it is how a clone
 * chain is read back, which is why it is shown and editable rather than hidden.
 */
export function DocIdentity({ id, title, slug }: { id: string; title: string; slug: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [t, setT] = useState(title);
  const [s, setS] = useState(slug);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const dirty = t.trim() !== title || s.trim() !== slug;

  function save() {
    setBusy(true);
    setMsg(null);
    start(async () => {
      if (t.trim() !== title) {
        const r = await renameDoc(id, t);
        if (!r.ok) {
          setBusy(false);
          setMsg({ tone: "bad", text: r.error });
          return;
        }
      }
      if (s.trim() !== slug) {
        const r = await setDocSlug(id, s);
        if (!r.ok) {
          setBusy(false);
          setMsg({ tone: "bad", text: r.error });
          return;
        }
        setS(r.data?.slug ?? s);
      }
      setBusy(false);
      setMsg({ tone: "ok", text: "Saved." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input value={t} onChange={(e) => setT(e.target.value)} className="sm:max-w-sm" aria-label="Page name" />
        <Input
          value={s}
          onChange={(e) => setS(e.target.value)}
          className="font-mono sm:max-w-xs"
          aria-label="Page slug"
        />
        <Button size="sm" disabled={busy || !dirty} onClick={save}>
          {busy ? "Saving..." : dirty ? "Save name" : "Saved"}
        </Button>
      </div>
      {msg ? (
        <p className={msg.tone === "ok" ? "text-xs text-green-700" : "text-xs text-amber-700"}>{msg.text}</p>
      ) : null}
    </div>
  );
}
