"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAgencyTenant,
  enterAgencyTenant,
  removeAgencyTenant,
  restoreAgencyTenant,
  type AgencyTenantRow,
  type AgencyTenantsView,
} from "@/features/agency/actions";

/**
 * The Client workspaces screen: one row per agency tenant, with the one button that
 * matters (Enter), the login that was handed over, and a create form underneath.
 *
 * The meter is at the top rather than next to the button because the number it reports
 * decides whether the form below is usable at all, and an agency admin at their cap
 * needs to read "5 of 5" before they fill in a form that will be refused.
 */
export function AgencyTenantManager({ view }: { view: AgencyTenantsView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slug, setSlug] = useState("");
  const [open, setOpen] = useState(false);

  const { usage, canEdit } = view;
  const atCap = usage.used >= usage.limit;
  const readOnly = !canEdit || view.blocked !== "no";

  function create() {
    setError(null);
    start(async () => {
      const res = await createAgencyTenant(name, email, password, slug || undefined);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      setSlug("");
      setOpen(false);
      router.refresh();
    });
  }

  function remove(row: AgencyTenantRow) {
    setError(null);
    start(async () => {
      const res = await removeAgencyTenant(row.id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  function restore(row: AgencyTenantRow) {
    setError(null);
    start(async () => {
      const res = await restoreAgencyTenant(row.id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
        <span>
          <strong>{usage.used}</strong> of <strong>{usage.limit}</strong> client workspace
          {usage.limit === 1 ? "" : "s"}
          {usage.extra > 0 ? (
            <span className="text-[var(--muted-foreground)]">
              {" "}
              ({usage.included} on your plan, {usage.extra} added)
            </span>
          ) : null}
        </span>
        {atCap && usage.limit > 0 ? (
          <span className="text-xs text-[var(--muted-foreground)]">
            At your limit. One more is ${view.extraPriceUsd} a month, in Billing.
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-[var(--destructive)] px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      {view.tenants.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-[var(--muted-foreground)]">
          No client workspaces yet. Each one is a full workspace of its own: its own
          scorecards, its own ad account and pixel, its own leads, and its own domain if
          you choose to give it one. You run them all from this login.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {view.tenants.map((t) => (
            <li key={t.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">
                    {t.name}
                    {view.insideId === t.id ? (
                      <span className="ml-2 rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs font-normal">
                        you are in here
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {t.slug}
                    {t.domain ? ` · ${t.domain}` : ""}
                    {t.loginEmail ? ` · ${t.loginEmail}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => start(async () => { await enterAgencyTenant(t.id); })}
                  >
                    Enter
                  </Button>
                  {readOnly ? null : (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => remove(t)}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {t.assessmentCount} scorecard{t.assessmentCount === 1 ? "" : "s"} ·{" "}
                {t.submissionCount} response{t.submissionCount === 1 ? "" : "s"} · added {t.created}
              </div>
            </li>
          ))}
        </ul>
      )}

      {readOnly ? null : (
        <div className="rounded-lg border p-3">
          {open ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="at-name">Client name</Label>
                <Input id="at-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Dental" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="at-email">Their login email</Label>
                <Input
                  id="at-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@acmedental.com"
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                  A login is created with the workspace. Give it to the client, or keep it
                  and run the workspace yourself - either way you reach it with Enter,
                  without a password.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="at-pw">Their password</Label>
                <Input
                  id="at-pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="at-slug">Subdomain (optional)</Label>
                <Input
                  id="at-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="acme-dental"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button disabled={pending || atCap} onClick={create}>
                  {pending ? "Creating..." : "Create workspace"}
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" disabled={atCap} onClick={() => setOpen(true)}>
              {atCap ? "At your limit" : "Add a client workspace"}
            </Button>
          )}
        </div>
      )}

      {view.removed.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Removed</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Removed workspaces keep every scorecard, lead and setting, and their slot is
            free straight away. A paid slot stops costing at the end of the billing
            period, not the moment you remove it.
          </p>
          <ul className="flex flex-col gap-2">
            {view.removed.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3 text-sm">
                <span>
                  {t.name}{" "}
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {t.submissionCount} response{t.submissionCount === 1 ? "" : "s"} kept
                  </span>
                </span>
                {readOnly ? null : (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => restore(t)}>
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
