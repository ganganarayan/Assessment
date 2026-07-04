"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createTenant,
  listTenants,
  listUsers,
  assignUserToTenant,
  setUserSuperAdmin,
  deleteUser,
  enterTenant,
  type TenantRow,
  type PlatformUserRow,
} from "@/features/platform/actions";

/**
 * Super-admin console: create tenants, assign logins to a tenant (as its admin),
 * and promote/demote platform super-admins. Logins self-serve at /sign-up, then get
 * assigned here. Full tenant isolation + impersonation land in later stages.
 */
export function PlatformConsole({
  initialTenants,
  initialUsers,
  currentUserId,
}: {
  initialTenants: TenantRow[];
  initialUsers: PlatformUserRow[];
  currentUserId: string;
}) {
  const [tenants, setTenants] = useState<TenantRow[]>(initialTenants);
  const [users, setUsers] = useState<PlatformUserRow[]>(initialUsers);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = async () => {
    const [t, u] = await Promise.all([listTenants(), listUsers()]);
    if (t.ok && t.data) setTenants(t.data);
    if (u.ok && u.data) setUsers(u.data);
  };

  const create = () =>
    start(async () => {
      setError(null);
      const r = await createTenant(name, slug);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setName("");
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
      if (!confirm(`Delete the login ${u.email}? This removes their account and sign-in access.`)) return;
      const r = await deleteUser(u.id);
      if (!r.ok) setError(r.error);
      await refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      {/* Create tenant */}
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Create a tenant</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gita Clarity" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="gita" />
          </div>
          <Button disabled={pending} onClick={create}>Create tenant</Button>
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
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-[var(--muted-foreground)]">No tenants yet.</td></tr>
              ) : (
                tenants.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.slug}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{t.adminCount}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{t.assessmentCount}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{t.submissionCount}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await enterTenant(t.id); })}>
                        Enter →
                      </Button>
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
                          <option key={t.id} value={t.id}>{t.name} (Admin)</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
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
    </div>
  );
}
