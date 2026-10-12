"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type SupportKind } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { raiseSupportRequest } from "@/features/support/actions/tenant";
import {
  KIND_NOUN,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_TOTAL_BYTES,
  SUPPORT_TOPICS,
} from "@/lib/support/model";

const SELECT = "h-10 w-full rounded-md border bg-[var(--background)] px-3 text-sm text-[var(--foreground)]";

/**
 * The raise form, for either queue.
 *
 * FormData and not a typed object, because the screenshots go with it. The builder
 * already saves whole assessments through a server action, so the 8mb body limit covers
 * three images without any configuration change.
 *
 * The topic is a fixed list. It is the field the owner scans the queue by, so it earns
 * being chosen rather than typed, and the subject line is where anything the list does
 * not cover belongs.
 */
export function RaiseForm({ kind, hasWhatsapp }: { kind: SupportKind; hasWhatsapp: boolean }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Keep what fits, say what did not.
   *
   * The TOTAL is checked as well as each file, because the request body has a limit of
   * its own: three large images together would fail at the transport, which looks like
   * a dead button rather than a file that was too big.
   */
  function pickFiles(list: FileList | null) {
    if (!list) return;
    const kept: File[] = [];
    const left: string[] = [];
    let budget = MAX_ATTACHMENT_TOTAL_BYTES;
    for (const f of Array.from(list).slice(0, MAX_ATTACHMENTS)) {
      if (f.size > MAX_ATTACHMENT_BYTES || f.size > budget) {
        left.push(f.name);
        continue;
      }
      budget -= f.size;
      kept.push(f);
    }
    setFiles(kept);
    setMsg(left.length > 0 ? `Too large to attach, left out: ${left.join(", ")}` : null);
  }

  function submit() {
    setMsg(null);
    const form = new FormData();
    form.set("kind", kind);
    form.set("topic", topic);
    form.set("subject", subject);
    form.set("body", body);
    for (const f of files) form.append("files", f);

    start(async () => {
      const r = await raiseSupportRequest(form);
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setRef(r.data?.ref ?? null);
      setSkipped(r.data?.skippedFiles ?? []);
      setTopic("");
      setSubject("");
      setBody("");
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      // The thread is where the conversation now lives, so that is normally where they
      // go. NOT when a screenshot failed to attach: being moved on from that is how
      // somebody finds out three replies later that the picture was never there.
      const lost = (r.data?.skippedFiles ?? []).length > 0;
      if (r.data?.id && !lost) router.push(`/w/${kind === "ONBOARDING" ? "onboarding" : "support"}/${r.data.id}`);
      else router.refresh();
    });
  }

  if (ref) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <p className="text-sm font-medium">🟢 Raised. Your reference is {ref}.</p>
        <p className="text-sm text-[var(--muted-foreground)]">
          A confirmation is on its way to your email. You will be told the moment there is a reply,
          and the whole conversation stays on this page.
        </p>
        {skipped.length > 0 ? (
          <p className="text-sm">
            🟡 These did not attach: {skipped.join(", ")}. The request went through without them.
            Open the thread and add them there, or describe what they showed.
          </p>
        ) : null}
        <p>
          <a
            className="text-sm underline"
            href={`/w/${kind === "ONBOARDING" ? "onboarding" : "support"}`}
          >
            See your {kind === "ONBOARDING" ? "requests" : "tickets"}
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="support-topic">What is this about</Label>
        <select
          id="support-topic"
          className={SELECT}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          <option value="">Pick one</option>
          {SUPPORT_TOPICS[kind].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="support-subject">One line</Label>
        <Input
          id="support-subject"
          placeholder={
            kind === "ONBOARDING"
              ? "e.g. Set up my clinic scorecard before Monday"
              : "e.g. Submissions stopped arriving yesterday afternoon"
          }
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="support-body">The detail</Label>
        <Textarea
          id="support-body"
          rows={7}
          placeholder={
            kind === "ONBOARDING"
              ? "Who you sell to, what you sell, and what makes a lead worth a call. Anything you already have written down about who wastes your time is the most useful thing you can paste here."
              : "What you expected, what happened instead, and where. A link to the assessment or the live funnel helps more than anything else."
          }
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          {kind === "SUPPORT"
            ? "What you expected, what you saw, and the link. Those three answer most of it without a second round trip."
            : "The more you say about who a bad lead is, the better the gate we write with you."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="support-files">Screenshots (optional)</Label>
        <input
          id="support-files"
          ref={fileInput}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          onChange={(e) => pickFiles(e.target.files)}
          className="text-sm"
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Up to {MAX_ATTACHMENTS}, {Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}mb each and{" "}
          {Math.round(MAX_ATTACHMENT_TOTAL_BYTES / (1024 * 1024))}mb in total. Only you and Assess360
          support can open them.
        </p>
        {files.length > 0 ? (
          <ul className="text-xs text-[var(--muted-foreground)]">
            {files.map((f) => (
              <li key={f.name}>{f.name}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {!hasWhatsapp ? (
        <p className="rounded-md border p-3 text-xs text-[var(--muted-foreground)]">
          🟡 You have no WhatsApp number saved, so support can only reach you by email. Add one in
          Settings if you would rather be pinged there as well.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending || !topic || !subject.trim() || !body.trim()} onClick={submit}>
          {pending ? "Sending..." : `Raise this ${KIND_NOUN[kind]}`}
        </Button>
        {msg ? <span className="text-sm text-[var(--muted-foreground)]">{msg}</span> : null}
      </div>
    </div>
  );
}
