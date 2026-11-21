"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listAiModels,
  saveWorkspaceModel,
  type WorkspaceModelView,
} from "@/features/admin/actions/ai-settings";
import { MODELS_BY_PROVIDER, type AiModelOption } from "@/lib/ai/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SELECT_CLASS =
  "h-10 rounded-md border bg-[var(--background)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/**
 * The Model picker on /w/ai. Rendered only when getWorkspaceModelView allows it, which
 * is the liveAiModels release switch (every workspace once released, otherwise the
 * platform's internal workspaces only). The list is the provider's live one.
 */
export function WorkspaceModelForm({ view, readOnly }: { view: WorkspaceModelView; readOnly: boolean }) {
  const router = useRouter();
  const [model, setModel] = useState(view.model);
  const [custom, setCustom] = useState(false);
  const [options, setOptions] = useState<AiModelOption[]>(MODELS_BY_PROVIDER[view.provider]);
  const [note, setNote] = useState("Loading the models this provider offers…");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listAiModels(view.provider)
      .then((r) => {
        if (cancelled) return;
        setOptions(r.models);
        setNote(
          r.live
            ? `Every model the provider offers right now, newest first (${r.models.length}).`
            : r.source === "error"
              ? `Showing the built-in list: the provider did not return its models (${r.detail ?? "unknown error"}). Custom takes any model id.`
              : "Showing the built-in list. Custom takes any model id.",
        );
      })
      .catch(() => {
        if (!cancelled) setNote("Showing the built-in list: the app could not be reached.");
      });
    return () => {
      cancelled = true;
    };
  }, [view.provider]);

  const listed: AiModelOption[] =
    model && !options.some((o) => o.value === model) ? [{ value: model, label: `${model} (saved)` }, ...options] : options;

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveWorkspaceModel(model);
      setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="w-ai-model">Model</Label>
        <select
          id="w-ai-model"
          className={SELECT_CLASS}
          disabled={readOnly}
          value={custom ? "__custom__" : model}
          onChange={(e) => {
            if (e.target.value === "__custom__") {
              setCustom(true);
            } else {
              setCustom(false);
              setModel(e.target.value);
            }
          }}
        >
          <option value="">Default ({view.defaultModel})</option>
          {listed.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>
        <p className="text-xs text-[var(--muted-foreground)]">{note}</p>
        {custom ? (
          <Input
            value={model}
            disabled={readOnly}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Exact model id"
          />
        ) : null}
      </div>
      {readOnly ? null : (
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save model"}
          </Button>
          {msg ? (
            <span className={msg.ok ? "text-xs text-[var(--muted-foreground)]" : "text-xs text-red-600"}>{msg.text}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
