"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createTenant,
  deleteTenant,
  setTenantUnlimited,
  setTenantPayments,
  setTenantPlanGrant,
  restoreTenant,
  purgeTenant,
  listTenants,
  listDeletedTenants,
  listUsers,
  listDeletedUsers,
  assignUserToTenant,
  setUserSuperAdmin,
  setUserPassword,
  deleteUser,
  restoreUser,
  enterTenant,
  type TenantRow,
  type PlatformUserRow,
} from "@/features/platform/actions";
import { PLATFORM_TENANT_ID } from "@/lib/tenant/platform-tenant";
import { PLAN_IDS } from "@/lib/billing/plans";
import { effectiveAccess } from "@/features/platform/effective-plan";

/** A saved-state line for ONE tenant's access grant, shown under that row's date. */
type GrantMsg = { tone: "ok" | "warn" | "error"; text: string };

/** yyyy-mm-dd for <input type="date">, from an ISO instant. Rendered in IST, because
 *  the grant is stored as the end of an IST day and a date box that showed the UTC day
 *  would read one day early all evening. */
function istDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/** "12 Nov 2026" for the one-line "runs to <date>" notes, where a time means nothing. */
function shortIST(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/**
 * "12 Nov 2026" over "14:32" for the two columns where the time is the point.
 *
 * Signed up and Last login are read together to answer one question - did they come
 * back, and how long after - and a date alone cannot answer it for anyone who signed up
 * and logged in the same day, which is almost everyone.
 *
 * Returned as two parts so the cell can print the time quietly under the date rather
 * than widening the column with a single long string.
 */
function stampIST(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }),
  };
}

/**
 * A date over its time, with an optional third line. Used by Signed up and Last login.
 *
 * The sign-in COUNT goes on that third line rather than in a column of its own: the
 * tenant table is already wide, and a bare number in its own column is a statistic,
 * while the same number under a date is a fact about that date - "last seen then, and
 * that was their second visit ever".
 */
function Stamp({ iso, empty = "-", note }: { iso: string | null; empty?: string; note?: string | null }) {
  const v = stampIST(iso);
  if (!v) {
    return (
      <span className="flex flex-col leading-tight">
        <span className="text-[var(--muted-foreground)]">{empty}</span>
        {note ? <span className="text-[11px] text-[var(--muted-foreground)]">{note}</span> : null}
      </span>
    );
  }
  return (
    <span className="flex flex-col leading-tight">
      <span className="whitespace-nowrap">{v.date}</span>
      <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">{v.time}</span>
      {note ? <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">{note}</span> : null}
    </span>
  );
}

/** "1 sign-in" / "7 sign-ins", or nothing at all when there is no record to describe.
 *  Zero prints nothing rather than "0 sign-ins": the count is a floor backfilled from
 *  surviving sessions, so zero means "nothing recorded", and stating it as a number
 *  would read as a measurement nobody took. */
function signInNote(n: number): string | null {
  return n > 0 ? `${n} sign-in${n === 1 ? "" : "s"}` : null;
}

/** Whether a stored grant is still live - the same rule the resolver applies. */
function grantLive(planExpiresAt: string | null): boolean {
  return !!planExpiresAt && new Date(planExpiresAt).getTime() > Date.now();
}

/**
 * Super-admin console: create tenants, assign logins to a tenant (as its admin),
 * and promote/demote platform super-admins. Logins self-serve at /sign-up, then get
 * assigned here. Full tenant isolation + impersonation land in later stages.
 */
export function PlatformConsole({
  initialTenants,
  initialDeletedTenants,
  initialUsers,
  initialDeletedUsers,
  currentUserId,
}: {
  initialTenants: TenantRow[];
  initialDeletedTenants: TenantRow[];
  initialUsers: PlatformUserRow[];
  initialDeletedUsers: PlatformUserRow[];
  currentUserId: string;
}) {
  const [tenants, setTenants] = useState<TenantRow[]>(initialTenants);
  const [deletedTenants, setDeletedTenants] = useState<TenantRow[]>(initialDeletedTenants);
  const [users, setUsers] = useState<PlatformUserRow[]>(initialUsers);
  const [deleted, setDeleted] = useState<PlatformUserRow[]>(initialDeletedUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [grantMsg, setGrantMsg] = useState<Record<string, GrantMsg | null>>({});
  const [pending, start] = useTransition();

  const refresh = async () => {
    const [t, dt, u, d] = await Promise.all([
      listTenants(),
      listDeletedTenants(),
      listUsers(),
      listDeletedUsers(),
    ]);
    if (t.ok && t.data) setTenants(t.data);
    if (dt.ok && dt.data) setDeletedTenants(dt.data);
    if (u.ok && u.data) setUsers(u.data);
    if (d.ok && d.data) setDeleted(d.data);
  };

  const setPw = (u: PlatformUserRow) =>
    start(async () => {
      setError(null);
      const pw = window.prompt(`Set a new password for ${u.email}.\nThey'll be signed out and forced to change it on next login.`);
      if (pw == null) return;
      const r = await setUserPassword(u.id, pw);
      if (!r.ok) return setError(r.error);
      window.alert(`Password set for ${u.email}. Share it with them; they'll set their own on first login.`);
      await refresh();
    });

  const restore = (u: PlatformUserRow) =>
    start(async () => {
      setError(null);
      const r = await restoreUser(u.id);
      if (!r.ok) setError(r.error);
      await refresh();
    });

  // Reversible. No typed slug: this destroys nothing, and demanding one here would
  // train the reflex that gets used on the permanent delete below.
  const delTenant = (t: TenantRow) =>
    start(async () => {
      setError(null);
      if (
        !confirm(
          `Delete "${t.name}"?\n\nIt moves to Deleted tenants. Its funnel stops, its domains stop resolving and its admins lose access - but nothing is erased, and you can restore it.`,
        )
      )
        return;
      const r = await deleteTenant(t.id);
      if (!r.ok) return setError(r.error);
      await refresh();
    });

  const toggleUnlimited = (t: TenantRow) =>
    start(async () => {
      setError(null);
      const r = await setTenantUnlimited(t.id, !t.unlimited);
      if (!r.ok) return setError(r.error);
      await refresh();
    });

  /**
   * Save one tenant's access grant and confirm it UNDER that row's date, which is
   * where the person is looking. Auto-saves on change: picking a date is the whole
   * intent, so a separate Save button is one click and one chance to forget.
   *
   * The confirmation repeats what the server resolved rather than "saved", so a date
   * in the past or an Unlimited tenant says so instead of looking like it worked.
   */
  const saveGrant = (t: TenantRow, plan: string, untilDate: string) =>
    start(async () => {
      setError(null);
      setGrantMsg((m) => ({ ...m, [t.id]: { tone: "ok", text: "Saving…" } }));
      const r = await setTenantPlanGrant(t.id, plan, untilDate || null);
      if (!r.ok) {
        setGrantMsg((m) => ({ ...m, [t.id]: { tone: "error", text: r.error } }));
        return;
      }
      const text = r.data?.summary ?? "Saved.";
      const tone: GrantMsg["tone"] = /past|Unlimited|cleared/.test(text) ? "warn" : "ok";
      setGrantMsg((m) => ({ ...m, [t.id]: { tone, text } }));
      await refresh();
      window.setTimeout(() => setGrantMsg((m) => ({ ...m, [t.id]: null as unknown as GrantMsg })), 4000);
    });

  const togglePayments = (t: TenantRow) =>
    start(async () => {
      setError(null);
      const r = await setTenantPayments(t.id, !t.paymentsEnabled);
      if (!r.ok) return setError(r.error);
      await refresh();
    });

  const restoreT = (t: TenantRow) =>
    start(async () => {
      setError(null);
      const r = await restoreTenant(t.id);
      if (!r.ok) return setError(r.error);
      await refresh();
    });

  // The irreversible one. Reachable only from the deleted list, and it spells out what
  // is about to be destroyed by COUNT, because "12 assessments and 4,318 submissions"
  // stops a mistake that the word "everything" does not.
  const purgeT = (t: TenantRow) =>
    start(async () => {
      setError(null);
      const typed = window.prompt(
        `PERMANENTLY delete "${t.name}" and everything it owns:\n` +
          `  • ${t.assessmentCount} assessment(s)\n` +
          `  • ${t.submissionCount} submission(s)\n` +
          `  • its domains, webhooks, payments and settings\n\n` +
          `Logins are kept (unassigned). THIS CANNOT BE UNDONE.\n\nType the slug to confirm:\n${t.slug}`,
      );
      if (typed == null) return;
      const r = await purgeTenant(t.id, typed);
      if (!r.ok) return setError(r.error);
      await refresh();
    });

  const create = () =>
    start(async () => {
      setError(null);
      const r = await createTenant(name, email, password, slug);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      setSlug("");
      await refresh();
    });

  const assign = (userId: string, tenantId: string) =>
    start(async () => {
      await assignUserToTenant(userId, tenantId || null);
      await refresh();
    });

  const toggleSuper = (u: PlatformUserRow) =>
    start(async () => {
      const makeSuper = !u.isSuper;
      if (!confirm(makeSuper ? `Make ${u.email} a platform super-admin?` : `Remove super-admin from ${u.email}?`)) return;
      const r = await setUserSuperAdmin(u.id, makeSuper);
      if (!r.ok) setError(r.error);
      await refresh();
    });

  const del = (u: PlatformUserRow) =>
    start(async () => {
      if (!confirm(`Delete the login ${u.email}? They'll be signed out and moved to Deleted users (recoverable), and unassigned from their tenant.`)) return;
      const r = await deleteUser(u.id);
      if (!r.ok) setError(r.error);
      await refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      {/* Create tenant */}
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Create a tenant</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Creates the tenant AND its admin login. Name, email and password are required - the admin
          can sign in immediately. Slug is auto-derived from the name unless you set one.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gita Clarity" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Admin email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@brand.com" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Password *</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 chars" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Slug (optional)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from name" />
          </div>
          <Button disabled={pending || !name.trim() || !email.trim() || !password.trim()} onClick={create}>Create tenant</Button>
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
      </section>

      {/* Tenants */}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Tenants ({tenants.length})</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-1.5">Name</th>
                <th className="px-3 py-1.5">Slug</th>
                <th className="px-3 py-1.5 text-center">Admins</th>
                <th className="px-3 py-1.5 text-center">Assessments</th>
                <th className="px-3 py-1.5 text-center">Submissions</th>
                <th className="px-3 py-1.5">Source</th>
                <th className="px-3 py-1.5">Signed up</th>
                <th className="px-3 py-1.5">Last login</th>
                <th className="px-3 py-1.5">Plan &amp; access</th>
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-4 text-center text-[var(--muted-foreground)]">No tenants yet.</td></tr>
              ) : (
                tenants.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.slug}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{t.adminCount}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{t.assessmentCount}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{t.submissionCount}</td>
                    <td className="px-3 py-2 text-xs text-[var(--muted-foreground)]">{t.source ?? "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-[var(--muted-foreground)]">
                      <Stamp iso={t.createdAt} />
                    </td>
                    {/* "Never" and "not since we started recording" are different facts
                        and the column says which: a tenant created before the lastLoginAt
                        column existed, whose sessions had already expired, has no stamp to
                        backfill from - calling that "never" would be a claim the data does
                        not support. */}
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-[var(--muted-foreground)]">
                      <Stamp iso={t.lastLoginAt} empty="Not since 8 Oct" note={signInNote(t.loginCount)} />
                    </td>
                    {/*
                      THE PLAN IS STATED FIRST, AND IT IS THE RESOLVED ONE.

                      This cell used to lead with the grant dropdown, which is bound to
                      `Tenant.plan` - a column that defaults to GATE on every row and is
                      never written by signup. So every self-serve tenant on a 14-day
                      SIGNAL trial was displayed as GATE, with the truth ("Trial to 21
                      Oct") in small grey type underneath. The entitlement was always
                      right; the column said otherwise and was believed.

                      Now: what they have, then why, then the controls that change it -
                      and the answer comes from effectiveAccess(), which runs the same
                      precedence as the resolver rather than a second copy of it in JSX.
                    */}
                    <td className="px-3 py-2 align-top">
                      {t.id === PLATFORM_TENANT_ID ? (
                        <span className="text-xs text-[var(--muted-foreground)]">Part of the app</span>
                      ) : (
                        <PlanAndAccess
                          t={t}
                          pending={pending}
                          grantMsg={grantMsg[t.id] ?? null}
                          onSaveGrant={saveGrant}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span>{t.status}</span>
                        {t.unlimited ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-green-600">
                            Unlimited
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await enterTenant(t.id); })}>
                          Enter →
                        </Button>
                        {t.id === PLATFORM_TENANT_ID ? null : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => toggleUnlimited(t)}
                            title={
                              t.unlimited
                                ? "Put this tenant back on its plan (limits and feature gates apply again)"
                                : "Run this tenant as your own: unlimited responses, every feature on, never metered"
                            }
                          >
                            {t.unlimited ? "Use plan" : "Make unlimited"}
                          </Button>
                        )}
                        {t.id === PLATFORM_TENANT_ID ? null : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => togglePayments(t)}
                            title={
                              t.paymentsEnabled
                                ? "Stop this tenant collecting payments from respondents (their funnels run free; nothing is deleted)"
                                : "Let this tenant collect payments from respondents again"
                            }
                          >
                            {t.paymentsEnabled ? "Payments: on" : "Payments: off"}
                          </Button>
                        )}
                        {t.id === PLATFORM_TENANT_ID ? (
                          <span className="self-center text-xs text-[var(--muted-foreground)]">
                            Part of the app
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => delTenant(t)}
                            className="border-red-500 text-red-600 hover:bg-red-500/10"
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Users */}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Logins ({users.length})</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          A tenant admin signs up at <span className="font-mono">/sign-up</span>, then you assign them to a tenant here.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-1.5">User</th>
                <th className="px-3 py-1.5">Access</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">{u.name}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {u.isSuper ? (
                      <span className="font-medium text-green-600">Super admin{u.isOwner ? " (owner)" : ""}</span>
                    ) : (
                      <select
                        value={u.tenantId ?? ""}
                        disabled={pending}
                        onChange={(e) => assign(u.id, e.target.value)}
                        className="h-8 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                      >
                        <option value="">Unassigned (Admin)</option>
                        {tenants.map((t) => (
                          <option key={t.id} value={t.id}>{t.name} · {t.slug} (Admin)</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {u.isOwner ? null : (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => setPw(u)}>
                          Set password
                        </Button>
                      )}
                      {u.isOwner ? null : (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleSuper(u)}>
                          {u.isSuper ? "Remove super-admin" : "Make super-admin"}
                        </Button>
                      )}
                      {!u.isOwner && u.id !== currentUserId ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => del(u)}
                          className="border-red-500 text-red-600 hover:bg-red-500/10"
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Deleted tenants - the only place the permanent delete exists */}
      {deletedTenants.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Deleted tenants ({deletedTenants.length})</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Their funnels are off and their admins are locked out, but nothing has been erased.
            Restore brings the tenant back with all of its data. Delete permanently is the only
            action that actually destroys anything - and it cannot be undone.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-1.5">Name</th>
                  <th className="px-3 py-1.5">Slug</th>
                  <th className="px-3 py-1.5 text-center">Assessments</th>
                  <th className="px-3 py-1.5 text-center">Submissions</th>
                  <th className="px-3 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {deletedTenants.map((t) => (
                  <tr key={t.id} className="text-[var(--muted-foreground)]">
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.slug}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{t.assessmentCount}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{t.submissionCount}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => restoreT(t)}>
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => purgeT(t)}
                          className="border-red-500 text-red-600 hover:bg-red-500/10"
                        >
                          Delete permanently
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Deleted users */}
      {deleted.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Deleted users ({deleted.length})</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Signed out + unassigned from their tenant. Restore to re-enable sign-in (then reassign a tenant).
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-1.5">User</th>
                  <th className="px-3 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {deleted.map((u) => (
                  <tr key={u.id} className="text-[var(--muted-foreground)]">
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{u.name}</span>
                        <span className="text-xs">{u.email}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => restore(u)}>Restore</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}


/**
 * The "Plan & access" cell: what this tenant HAS, then why, then the grant controls.
 *
 * Its own component rather than inline JSX because the cell now has a derived value
 * (the resolved access) and three conditional notes, and an IIFE inside a table row is
 * where that becomes unreadable.
 */
function PlanAndAccess({
  t,
  pending,
  grantMsg,
  onSaveGrant,
}: {
  t: TenantRow;
  pending: boolean;
  grantMsg: { tone: string; text: string } | null;
  onSaveGrant: (t: TenantRow, plan: string, untilDate: string) => void;
}) {
  const acc = effectiveAccess(t);
  const liveGrant = grantLive(t.planExpiresAt);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className={acc.source === "parked" ? "text-sm font-semibold text-yellow-600" : "text-sm font-semibold"}>
          {acc.planLabel}
        </span>
        <span className="text-[11px] text-[var(--muted-foreground)]">
          {acc.detail}
          {acc.until ? ` to ${shortIST(acc.until)}` : ""}
        </span>
      </div>

      {/* The manual grant, now plainly labelled as the thing it is. Unlabelled, it read
          as "this tenant's plan", which is exactly how a trialling SIGNAL workspace came
          to look like a GATE one. */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-[var(--muted-foreground)]">Grant:</span>
        <select
          className="h-8 rounded-md border bg-transparent px-2 text-xs"
          value={t.plan}
          disabled={pending}
          onChange={(e) => onSaveGrant(t, e.target.value, istDateInputValue(t.planExpiresAt))}
          title="A manual grant: this plan, until the date beside it. Without a date it entitles nothing."
        >
          {PLAN_IDS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input
          type="date"
          className="h-8 rounded-md border bg-transparent px-2 text-xs"
          value={istDateInputValue(t.planExpiresAt)}
          disabled={pending}
          onChange={(e) => onSaveGrant(t, t.plan, e.target.value)}
          title="Access runs to the end of this day (IST). Clear it to remove the grant."
        />
      </div>

      {/* Why the controls above are doing nothing, when they are doing nothing. Without
          this the owner sets a grant, watches nothing change, and the screen offers no
          reason at all. */}
      {acc.source !== "grant" && liveGrant ? (
        <span className="text-[11px] text-[var(--muted-foreground)]">
          {acc.source === "unlimited" ? "Unlimited - the grant is ignored" : "The paid subscription outranks this grant"}
        </span>
      ) : null}
      {acc.source === "trial" && !liveGrant ? (
        <span className="text-[11px] text-[var(--muted-foreground)]">
          No grant set - the trial is what entitles them
        </span>
      ) : null}

      {grantMsg ? (
        <span
          className={
            grantMsg.tone === "error"
              ? "text-[11px] font-medium text-red-500"
              : grantMsg.tone === "warn"
                ? "text-[11px] font-medium text-yellow-600"
                : "text-[11px] font-medium text-green-600"
          }
        >
          {grantMsg.text}
        </span>
      ) : null}
    </div>
  );
}
