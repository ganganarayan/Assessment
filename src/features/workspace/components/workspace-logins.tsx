"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWorkspaceUserPassword, type WorkspaceLogin } from "@/features/workspace/actions/logins";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PasswordInput } from "@/components/ui/password-input";

/**
 * Set a password for a login in THIS workspace — the control that replaces "Change
 * password" while a super admin is impersonating, so the button acts on the account
 * named next to it instead of silently on the operator's own.
 */
export function WorkspaceLogins({ logins }: { logins: WorkspaceLogin[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = (u: WorkspaceLogin) =>
    start(async () => {
      setMsg(null);
      const res = await setWorkspaceUserPassword(u.id, pw);
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setPw("");
      setOpenId(null);
      setMsg({ ok: true, text: `Password set for ${u.email}. They'll be asked to choose their own on first sign-in.` });
      router.refresh();
    });

  if (!logins.length) {
    return <p className="text-sm text-[var(--muted-foreground)]">This workspace has no logins yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {logins.map((u) => (
        <div key={u.id} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{u.name}</p>
              <p className="truncate text-sm text-[var(--muted-foreground)]">{u.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {u.staffPermission ? <Badge variant="muted">{u.staffPermission}</Badge> : <Badge>Admin</Badge>}
              {u.noPassword ? <Badge variant="outline">No password set</Badge> : null}
              {u.mustChangePassword ? <Badge variant="muted">Must change on next sign-in</Badge> : null}
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setPw("");
                  setMsg(null);
                  setOpenId(openId === u.id ? null : u.id);
                }}
              >
                {openId === u.id ? "Cancel" : "Set password"}
              </Button>
            </div>
          </div>

          {openId === u.id ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <PasswordInput
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <Button size="sm" disabled={pending || pw.trim().length < 8} onClick={() => save(u)}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : null}
        </div>
      ))}

      {msg ? (
        <p className={`text-sm ${msg.ok ? "text-green-500" : "text-red-500"}`} role="alert">
          {msg.text}
        </p>
      ) : null}

      <p className="text-xs text-[var(--muted-foreground)]">
        Setting a password signs this login out everywhere and asks them to choose their own on the
        next sign-in. It does not touch your own account.
      </p>
    </div>
  );
}
