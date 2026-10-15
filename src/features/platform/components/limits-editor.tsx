"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readTenantLimits, setTenantLimitOverrides, type TenantLimitsView } from "@/features/platform/actions";
import {
  LIMIT_FIELDS,
  emptyDraft,
  formatLimit,
  type FeatureChoice,
  type LimitsDraft,
} from "@/features/platform/limits-override";
import { FEATURES, type Feature } from "@/lib/billing/plans";

/**
 * The per-tenant limits editor, opened from a tenant row on /platform.
 *
 * 🔴 WHY IT SHOWS THREE COLUMNS. An override REPLACES the plan's value, it does not add
 * to it, so "5" in Ad accounts means five and not five more. The only way to make that
 * legible is to put the plan's number, the override and the resolved number side by side
 * and let the operator read the arithmetic. The resolved column comes from the resolver
 * itself, so it cannot flatter the override.
 */
export function LimitsEditor({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [view, setView] = useState<TenantLimitsView | null>(null);
  const [draft, setDraft] = useState<LimitsDraft>(emptyDraft());
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(() => {
    start(async () => {
      const r = await readTenantLimits(tenantId);
      if (!r.ok || !r.data) {
        setLoadError(r.ok ? "Couldn't load this tenant's limits." : r.error);
        return;
      }
      setLoadError(null);
      setView(r.data);
      setDraft(r.data.draft);
    });
  }, [tenantId]);

  useEffect(load, [load]);

  const save = () =>
    start(async () => {
      setMsg({ tone: "ok", text: "Saving…" });
      const r = await setTenantLimitOverrides(tenantId, draft);
      if (!r.ok) {
        setMsg({ tone: "error", text: r.error });
        return;
      }
      const text = r.data?.summary ?? "Saved.";
      setMsg({ tone: /nothing changes|cleared|Unlimited/.test(text) ? "warn" : "ok", text });
      load();
    });

  const clear = () =>
    start(async () => {
      setMsg({ tone: "ok", text: "Clearing…" });
      const r = await setTenantLimitOverrides(tenantId, emptyDraft());
      if (!r.ok) {
        setMsg({ tone: "error", text: r.error });
        return;
      }
      setDraft(emptyDraft());
      setMsg({ tone: "warn", text: r.data?.summary ?? "Override cleared." });
      load();
    });

  const setLimit = (key: (typeof LIMIT_FIELDS)[number]["key"], value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setFeature = (flag: Feature, choice: FeatureChoice) =>
    setDraft((d) => ({ ...d, features: { ...d.features, [flag]: choice } }));

  if (loadError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
        <span className="text-sm text-red-500">{loadError}</span>
        <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
      </div>
    );
  }

  if (!view) {
    return <div className="rounded-lg border p-3 text-sm text-[var(--muted-foreground)]">Loading limits…</div>;
  }

  const blocked = view.blockedReason !== null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-[var(--muted)]/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Limits for {view.tenantName}</span>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {view.baseSource === "snapshot"
              ? "Plan column is this subscription's frozen snapshot, which is what a later catalog change cannot re-rate."
              : "No subscription, so the plan column is the code catalog."}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={onClose} disabled={pending}>Close</Button>
      </div>

      {/* Why the controls below will not do anything, BEFORE the operator types into
          them. An editor that accepts input it cannot store is worse than no editor. */}
      {blocked ? (
        <p className="rounded-md border border-yellow-500/40 bg-yellow-500/5 p-2 text-xs text-yellow-700 dark:text-yellow-500">
          {view.blockedReason}
        </p>
      ) : null}

      {view.unlimited ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          This tenant is Unlimited, which resolves ahead of any override. These numbers apply again the moment
          you put it back on its plan.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
            <tr>
              <th className="py-1 pr-3 font-medium">Limit</th>
              <th className="py-1 pr-3 font-medium">Plan</th>
              <th className="py-1 pr-3 font-medium">Override</th>
              <th className="py-1 font-medium">Resolved</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {LIMIT_FIELDS.map((f) => {
              const planValue = view.base[f.key];
              const resolved = view.resolved[f.key];
              const changed = planValue !== resolved;
              return (
                <tr key={f.key}>
                  <td className="py-1.5 pr-3 align-top">
                    <div className="flex flex-col">
                      <span>{f.label}</span>
                      <span className="text-[11px] text-[var(--muted-foreground)]">{f.hint}</span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 align-top tabular-nums text-[var(--muted-foreground)]">
                    {formatLimit(planValue)}
                  </td>
                  <td className="py-1.5 pr-3 align-top">
                    <Input
                      className="h-8 w-32 text-xs"
                      value={draft[f.key]}
                      disabled={pending || blocked}
                      placeholder={f.nullable ? "blank / number / unlimited" : "blank or number"}
                      onChange={(e) => setLimit(f.key, e.target.value)}
                    />
                  </td>
                  <td className={`py-1.5 align-top tabular-nums ${changed ? "font-semibold text-green-600" : ""}`}>
                    {formatLimit(resolved)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-[var(--muted-foreground)]">
        Blank follows the plan. A number REPLACES the plan&apos;s value, it does not add to it - so an extra ad
        account bought as an add-on belongs in a purchased counter, not here.
      </p>

      <details className="rounded-md border bg-[var(--background)] p-2">
        <summary className="cursor-pointer text-xs font-medium">
          Features ({FEATURES.filter((f) => draft.features[f] !== "inherit").length} overridden)
        </summary>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {FEATURES.map((flag) => (
            <label key={flag} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate" title={flag}>
                {flag}
                <span className="ml-1 text-[var(--muted-foreground)]">
                  ({view.base.features[flag] ? "on" : "off"} on plan)
                </span>
              </span>
              <select
                className="h-7 rounded-md border bg-transparent px-1 text-[11px]"
                value={draft.features[flag]}
                disabled={pending || blocked}
                onChange={(e) => setFeature(flag, e.target.value as FeatureChoice)}
              >
                <option value="inherit">Follow plan</option>
                <option value="on">Force on</option>
                <option value="off">Force off</option>
              </select>
            </label>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={pending || blocked}>Save limits</Button>
        <Button size="sm" variant="outline" onClick={clear} disabled={pending || blocked}>
          Clear override
        </Button>
        {msg ? (
          <span
            className={
              msg.tone === "error"
                ? "text-xs font-medium text-red-500"
                : msg.tone === "warn"
                  ? "text-xs font-medium text-yellow-600"
                  : "text-xs font-medium text-green-600"
            }
          >
            {msg.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
