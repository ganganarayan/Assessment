"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateAiSettings,
  saveProviderKey,
  testAi,
  listAiModels,
  type AiSettingsView,
  type ProviderKeyView,
} from "@/features/admin/actions/ai-settings";
import { AI_PROVIDERS, DEFAULT_MODEL, MODELS_BY_PROVIDER, type AiModelOption, type AiProvider } from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopySecretButton } from "@/components/copy-secret-button";
import { type SecretName } from "@/features/secrets/names";

const SELECT_CLASS =
  "h-10 rounded-md border bg-[var(--background)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

const PROVIDER_LABEL: Record<AiProvider, string> = {
  claude: "Claude (Anthropic)",
  openai: "OpenAI",
  gemini: "Google Gemini",
};

const KEY_SECRET: Record<AiProvider, SecretName> = {
  claude: "aiClaudeKey",
  openai: "aiOpenAiKey",
  gemini: "aiGeminiKey",
};

/** One provider's key: saved independently and reused, so switching provider/model
 *  never re-prompts. */
function ProviderKeyRow({ info }: { info: ProviderKeyView }) {
  const router = useRouter();
  const [val, setVal] = useState("");
  const [saving, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await saveProviderKey(info.provider, val);
      if (r.ok) {
        setVal("");
        setMsg("Saved.");
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-1 flex-col gap-1">
        <Label className="flex items-center gap-2">
          {PROVIDER_LABEL[info.provider]} key
          {info.hasKey ? (
            <span className="text-xs font-normal text-green-600">saved ••••{info.last4}</span>
          ) : (
            <span className="text-xs font-normal text-[var(--muted-foreground)]">not set</span>
          )}
        </Label>
        <Input
          type="password"
          autoComplete="off"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={info.hasKey ? "Saved - paste a new key to replace" : "Paste API key"}
        />
      </div>
      <Button size="sm" variant="outline" onClick={save} disabled={saving || !val.trim()}>
        {saving ? "Saving…" : "Save key"}
      </Button>
      {info.hasKey ? <CopySecretButton name={KEY_SECRET[info.provider]} /> : null}
      {msg ? <span className="text-xs text-[var(--muted-foreground)]">{msg}</span> : null}
    </div>
  );
}

export function AiSettingsForm({ initial }: { initial: AiSettingsView }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [provider, setProvider] = useState<AiProvider>(initial.provider);
  const [model, setModel] = useState(initial.model);
  // Custom-model mode: typed by hand. A saved model missing from the list stays
  // selected as its own option instead (see modelOptions), so it is never lost.
  const [customModel, setCustomModel] = useState(false);
  // The provider's live model list, fetched with the saved key. Starts on the static
  // fallback so the dropdown is never empty while it loads.
  const [catalog, setCatalog] = useState<{
    provider: AiProvider;
    models: AiModelOption[];
    live: boolean;
    source: string;
    detail?: string;
  }>({
    provider: initial.provider,
    models: MODELS_BY_PROVIDER[initial.provider],
    live: false,
    source: "no-key",
  });
  const [loadingModels, setLoadingModels] = useState(true);
  const [guidance, setGuidance] = useState(initial.guidance);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<{ ok: boolean; ms: number; text?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listAiModels(provider)
      .then((r) => {
        if (!cancelled) setCatalog({ provider, models: r.models, live: r.live, source: r.source, detail: r.detail });
      })
      .catch(() => {
        if (!cancelled)
          setCatalog({ provider, models: MODELS_BY_PROVIDER[provider], live: false, source: "error", detail: "the app could not be reached" });
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const listed = catalog.provider === provider ? catalog.models : MODELS_BY_PROVIDER[provider];
  const modelOptions: AiModelOption[] =
    model && !listed.some((m) => m.value === model)
      ? [{ value: model, label: `${model} (saved)` }, ...listed]
      : listed;

  const selectedHasKey = initial.keys.find((k) => k.provider === provider)?.hasKey ?? false;

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateAiSettings({ enabled, provider, model, guidance });
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setMsg({ ok: true, text: "Saved." });
      router.refresh();
    });
  }

  function runTest() {
    setTest(null);
    startTest(async () => {
      setTest(await testAi());
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Provider API keys - saved once per provider, reused whenever you select it. */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Provider API keys</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Save each key once. Switching provider or model below never asks again - it just uses
            the saved key. Stored encrypted at rest, never shown again.
          </p>
        </div>
        {initial.keys.map((k) => (
          <ProviderKeyRow key={k.provider} info={k} />
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable AI personalized statement
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label>Provider to use</Label>
          <select
            className={SELECT_CLASS}
            value={provider}
            onChange={(e) => {
              // Switching provider resets to that provider's default model. The key is
              // already saved per provider, so nothing is re-entered.
              setProvider(e.target.value as AiProvider);
              setLoadingModels(true);
              setModel("");
              setCustomModel(false);
            }}
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="ai-model">Model</Label>
          <select
            id="ai-model"
            className={SELECT_CLASS}
            value={customModel ? "__custom__" : model}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setCustomModel(true);
              } else {
                setCustomModel(false);
                setModel(e.target.value);
              }
            }}
          >
            <option value="">Default ({DEFAULT_MODEL[provider]})</option>
            {modelOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
          <p className="text-xs text-[var(--muted-foreground)]">
            {loadingModels
              ? "Loading the models this provider offers…"
              : catalog.live && catalog.provider === provider
                ? `Every model ${PROVIDER_LABEL[provider]} offers right now, newest first (${listed.length}).`
                : catalog.provider === provider && catalog.source === "error"
                  ? `Showing the built-in list: ${PROVIDER_LABEL[provider]} did not return its models (${catalog.detail ?? "unknown error"}). Custom takes any model id.`
                  : catalog.provider === provider && catalog.source === "held"
                    ? "Showing the built-in list. Custom takes any model id."
                    : "Showing the built-in list: save a key above to see every model this provider offers."}
          </p>
          {customModel ? (
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Exact model id, e.g. claude-opus-4-8"
            />
          ) : null}
        </div>
      </div>

      {!selectedHasKey ? (
        <p className="text-xs text-amber-600">
          No {PROVIDER_LABEL[provider]} key saved yet - add it above before enabling AI.
        </p>
      ) : null}

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

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save AI settings"}
        </Button>
        <Button variant="outline" onClick={runTest} disabled={testing}>
          {testing ? "Testing…" : "Test connection"}
        </Button>
      </div>

      {test ? (
        <div className="rounded-md border p-3 text-sm">
          {test.ok ? (
            <>
              <p className="font-medium text-green-600">Worked in {test.ms} ms - sample output:</p>
              <p className="mt-1 whitespace-pre-wrap text-[var(--foreground)]">{test.text}</p>
            </>
          ) : (
            <p className="text-red-500">Failed{test.ms ? ` after ${test.ms} ms` : ""}: {test.error}</p>
          )}
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Save your settings first - Test uses the saved config.
          </p>
        </div>
      ) : null}
    </div>
  );
}
