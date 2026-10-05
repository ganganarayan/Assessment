"use client";

import { useState, useTransition } from "react";
import { setPlanAiModels } from "@/features/admin/actions/platform-integrations";
import { PLAN_IDS, PLAN_LABEL, PLAN_LIMITS, type PlanId } from "@/lib/billing/plans";
import { MODELS_BY_PROVIDER, type AiProvider } from "@/lib/ai/types";
import { DEFAULT_TENANT_AI_MODEL } from "@/lib/ai/plan-models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Bind a model to each plan.
 *
 * Tenants never see this and never see a key field: they write the instructions, the
 * platform runs the model. What this screen controls is the cost of a statement, which
 * is why it belongs to the owner and why it is a stored value rather than a constant.
 *
 * Gate carries no `aiReports` entitlement, so its row is shown greyed with the reason
 * rather than hidden - a missing row reads as an oversight, a stated one reads as the
 * decision it is.
 */
export function PlanAiModelsForm({
  initial,
  provider,
}: {
  initial: Record<string, string>;
  /** The platform's configured provider, which decides the model list offered. */
  provider: AiProvider;
}) {
  const [models, setModels] = useState<Record<string, string>>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const options = MODELS_BY_PROVIDER[provider] ?? [];

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await setPlanAiModels(models);
      setMsg(r.ok ? "Saved." : r.error);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {PLAN_IDS.map((plan: PlanId) => {
          const entitled = PLAN_LIMITS[plan].features.aiReports;
          const value = models[plan] ?? "";
          return (
            <div key={plan} className="flex flex-wrap items-center gap-3">
              <Label className="w-28 text-sm">{PLAN_LABEL[plan]}</Label>
              {entitled ? (
                <>
                  <select
                    className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                    value={options.some((o) => o.value === value) ? value : ""}
                    onChange={(e) => setModels((m) => ({ ...m, [plan]: e.target.value }))}
                  >
                    <option value="">Default ({DEFAULT_TENANT_AI_MODEL})</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="w-56 font-mono text-xs"
                    placeholder="or type a model id"
                    value={value}
                    onChange={(e) => setModels((m) => ({ ...m, [plan]: e.target.value }))}
                  />
                </>
              ) : (
                <span className="text-xs text-[var(--muted-foreground)]">
                  No AI on this plan (the aiReports entitlement is off), so nothing to set.
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save model bindings"}
        </Button>
        {msg ? <span className="text-xs text-[var(--muted-foreground)]">{msg}</span> : null}
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Blank means the built-in default. A single tenant can be moved off its plan&apos;s model
        from the platform console, which is where an Enterprise exception belongs.
      </p>
    </div>
  );
}
