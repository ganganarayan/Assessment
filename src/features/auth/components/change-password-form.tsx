"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeOwnPassword, forceSetOwnPassword } from "@/features/auth/actions/password";

/**
 * Password form with two modes:
 *  - "self" (default, Settings → Change password): requires the CURRENT password;
 *    verified server-side, signs out other sessions.
 *  - "force" (the /change-password screen after a super-admin reset): no current
 *    password (the user just signed in with a temp one); redirects on success.
 */
export function ChangePasswordForm({
  mode = "self",
  redirectTo,
}: {
  mode?: "self" | "force";
  redirectTo?: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setMsg(null);
      setOk(false);
      if (next !== confirm) {
        setMsg("New password and confirmation don't match.");
        return;
      }
      const r = mode === "force" ? await forceSetOwnPassword(next) : await changeOwnPassword(current, next);
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setOk(true);
      if (mode === "force") {
        router.replace(redirectTo || "/");
        router.refresh();
        return;
      }
      setMsg("Password changed. Other sessions were signed out.");
      setCurrent("");
      setNext("");
      setConfirm("");
    });

  return (
    <div className="flex max-w-sm flex-col gap-3 text-left">
      {mode === "self" ? (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Current password</Label>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <Label className="text-xs">New password</Label>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Confirm new password</Label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </div>
      <div>
        <Button size="sm" onClick={submit} disabled={pending || !next || (mode === "self" && !current)}>
          {mode === "force" ? "Set password & continue" : "Change password"}
        </Button>
      </div>
      {msg ? <p className={`text-sm ${ok ? "text-green-600" : "text-red-500"}`}>{msg}</p> : null}
    </div>
  );
}
