"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateAiSettings,
  type AiSettingsView,
} from "@/features/admin/actions/ai-settings";
import { AI_PROVIDERS, DEFAULT_MODEL, type AiProvider } from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SELECT_CLASS =
  "h-10 rounded-md border bg-[var(--background)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

const PROVIDER_LABEL: Record<AiProvider, string> = {
  claude: "Claude (Anthropic)",
  openai: "OpenAI",
  gemini: "Google Gemini",
};

export function AiSettingsForm({ initial }: { initial: AiSettingsView }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [provider, setProvider] = useState<AiProvider>(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [guidance, setGuidance] = useState(initial.guidance);
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateAiSettings({ enabled, provider, model, guidance, apiKey });
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setApiKey(""); // never keep the secret in component state after save
      setMsg({ ok: true, text: "Saved." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable AI personalized statement
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label>Provider</Label>
          <select
            className={SELECT_CLASS}
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProvider)}
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="ai-model">Model</Label>
          <Input
            id="ai-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODEL[provider]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="ai-key">API key</Label>
        <Input
          id="ai-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            initial.hasKey
              ? `Configured ✓ ••••${initial.keyLast4 ?? ""} — leave blank to keep`
              : "Paste your provider API key"
          }
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Stored encrypted at rest and never shown again. Leave blank to keep the current key.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="ai-guidance">Guidance (optional)</Label>
        <Textarea
          id="ai-guidance"
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder="Tone + scoring direction, e.g. 'Warm, direct. Higher scores mean more emotional strain.'"
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Sent to the model with the raw scores. Use it to set tone and tell the model whether
          higher scores are better or worse.
        </p>
      </div>

      {msg ? (
        <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      ) : null}

      <div>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save AI settings"}
        </Button>
      </div>
    </div>
  );
}
