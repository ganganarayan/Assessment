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
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-4 text-center text-[var(--muted-foreground)]">No tenants yet.</td></tr>
              ) : (
                tenants.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.slug}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{t.adminCount}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{t.assessmentCount}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{t.submissionCount}</td>
                    <td className="px-3 py-2 text-xs text-[var(--muted-foreground)]">{t.source ?? "-"}</td>
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
