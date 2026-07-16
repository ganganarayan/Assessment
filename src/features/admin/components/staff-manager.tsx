"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStaff, setStaffPermission, removeStaff, type StaffView } from "@/features/admin/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const SELECT = "h-10 rounded-md border bg-[var(--background)] px-3 text-sm text-[var(--foreground)]";

export function StaffManager({ data }: { data: StaffView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permission, setPermission] = useState<"VIEW" | "EDIT">("VIEW");
  const [tenantId, setTenantId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const add = () =>
    start(async () => {
      setMsg(null);
      const res = await createStaff({ name, email, password, permission, tenantId: data.isSuper ? tenantId : undefined });
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      setMsg({ ok: true, text: "Staff added." });
      router.refresh();
    });

  const changePerm = (id: string, p: string) =>
    start(async () => {
      await setStaffPermission(id, p);
      router.refresh();
    });

  const remove = (id: string, who: string) =>
    start(async () => {
      if (!confirm(`Remove ${who}? They will lose all access immediately.`)) return;
      await removeStaff(id);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      {/* Add staff */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Add a staff member</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Email</Label>
            <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Password</Label>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Permission</Label>
            <select className={SELECT} value={permission} onChange={(e) => setPermission(e.target.value as "VIEW" | "EDIT")}>
              <option value="VIEW">View only — can see everything, cannot edit</option>
              <option value="EDIT">Edit — can view and edit</option>
            </select>
          </div>
          {data.isSuper ? (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label>Assign to</Label>
              <select className={SELECT} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                <option value="">Platform (super-admin staff — all tenants)</option>
                {data.tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={add} disabled={pending || !name.trim() || !email.trim() || password.length < 8}>
            {pending ? "Adding…" : "Add staff"}
          </Button>
          {msg ? <span className={`text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</span> : null}
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          They sign in at the normal login with this email + password. Staff can never manage staff
          or change you. Edit staff can edit content and settings{data.isSuper ? "" : " in this workspace"}; view staff are read-only.
        </p>
      </div>

      {/* Staff list */}
      {data.staff.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No staff yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                {data.isSuper ? <th className="px-3 py-2">Scope</th> : null}
                <th className="px-3 py-2">Permission</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.staff.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)]">{r.email}</td>
                  {data.isSuper ? (
                    <td className="px-3 py-2">
                      <Badge variant="muted">{r.scope === "platform" ? "Platform" : r.tenantName ?? "Tenant"}</Badge>
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <select className="h-8 rounded-md border bg-[var(--background)] px-2 text-xs" value={r.permission} onChange={(e) => changePerm(r.id, e.target.value)} disabled={pending}>
                      <option value="VIEW">View only</option>
                      <option value="EDIT">Edit</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(r.id, r.name)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
