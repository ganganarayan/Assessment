"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAiAdminKeys } from "@/features/admin/actions/ai-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The ADMIN credentials that read what the providers actually billed.
 *
 * 🔴 A DIFFERENT CREDENTIAL FROM THE KEYS ABOVE, and the form says so, because the
 * failure it prevents is silent: pasting an ordinary API key here produces a 401 on a
 * nightly cron nobody is watching, and the Accounts page simply keeps reading zero.
 * Anthropic's admin key starts sk-ant-admin and only an organisation admin can mint
 * one. Nothing generates with these.
 *
 * The API key ids are not secrets, so they are shown and a blank genuinely clears
 * them. The keys are, so they are write-only: a blank leaves the stored one alone,
 * because a form that never receives the saved value back would otherwise wipe a
 * working credential the moment somebody edited the field beside it.
 */
export function AiAdminKeysForm({
  claudeSaved,
  openAiSaved,
  claudeApiKeyId,
  openAiApiKeyId,
}: {
  claudeSaved: boolean;
  openAiSaved: boolean;
  claudeApiKeyId: string;
  openAiApiKeyId: string;
}) {
  const router = useRouter();
  const [claudeKey, setClaudeKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [claudeId, setClaudeId] = useState(claudeApiKeyId);
  const [openAiId, setOpenAiId] = useState(openAiApiKeyId);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await updateAiAdminKeys({
        claudeAdminKey: claudeKey,
        openAiAdminKey: openAiKey,
        claudeApiKeyId: claudeId,
        openAiApiKeyId: openAiId,
      });
      if (r.ok) {
        setClaudeKey("");
        setOpenAiKey("");
        setMsg("Saved.");
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });

  return (
    <div className="rounded-xl border p-5">
      <h2 className="font-semibold">Billing access (platform only)</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
        These read what Anthropic and OpenAI actually charged, so the AI cost on the
        Accounts page is the same number as the invoice rather than an estimate from a
        price list. They are <strong>admin</strong> keys, not the generation keys above:
        Anthropic&apos;s starts <code className="text-xs">sk-ant-admin</code> and only an
        organisation admin can create one. Nothing generates with them.
      </p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <KeyField
          id="claude-admin"
          label="Anthropic admin key"
          saved={claudeSaved}
          value={claudeKey}
          onChange={setClaudeKey}
        />
        <KeyField
          id="openai-admin"
          label="OpenAI admin key"
          saved={openAiSaved}
          value={openAiKey}
          onChange={setOpenAiKey}
        />
      </div>

      <p className="mt-6 text-sm font-medium">Which key is this product&apos;s</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
        The bill is for the whole organisation. If Assess360 shares an account with your
        other apps and is separated only by API key, put that key&apos;s id here and the
        day&apos;s spend is split by its share of the tokens.{" "}
        <strong>Leave it blank and the entire organisation&apos;s bill is counted as
        Assess360&apos;s</strong>, which is only right on a dedicated account.
      </p>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="claude-key-id">Anthropic API key id</Label>
          <Input
            id="claude-key-id"
            value={claudeId}
            onChange={(e) => setClaudeId(e.target.value)}
            placeholder="apikey_01..."
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="openai-key-id">OpenAI API key id</Label>
          <Input
            id="openai-key-id"
            value={openAiId}
            onChange={(e) => setOpenAiId(e.target.value)}
            placeholder="key_..."
          />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving..." : "Save billing access"}
        </Button>
        {msg ? <span className="text-sm text-[var(--muted-foreground)]">{msg}</span> : null}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--muted-foreground)]">
        A key alone changes nothing: the figures appear once the daily pull runs
        (npm run cron:ai-costs), which needs a Railway cron. It reads yesterday, never
        today, because a day is only final once it is over.
      </p>
    </div>
  );
}

function KeyField({
  id,
  label,
  saved,
  value,
  onChange,
}: {
  id: string;
  label: string;
  saved: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}{" "}
        {saved ? <span className="text-xs font-normal text-green-600">(saved)</span> : null}
      </Label>
      <Input
        id={id}
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={saved ? "Saved. Type to replace." : "Paste the admin key"}
      />
    </div>
  );
}
