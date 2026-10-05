"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { forceSetOwnPassword } from "@/features/auth/actions/password";

/**
 * Password form: new password + confirmation, nothing else.
 *
 * 🟡 The CURRENT-password field was removed at the owner's request. The trade-off is
 * explicit: it was what stopped someone who had got hold of an already-signed-in
 * browser from taking the account over outright. What still limits that is the session
 * revocation on the server - every other session is dropped the moment the password
 * changes, so a stolen session cannot quietly persist alongside the real owner.
 *
 * Two modes remain, differing only in where they send you afterwards:
 *  - "self" (Settings → Change password): stays put and confirms.
 *  - "force" (the /change-password screen after an admin set a temporary password):
 *    redirects onward once set.
 */
export function ChangePasswordForm({
  mode = "self",
  redirectTo,
}: {
  mode?: "self" | "force";
  redirectTo?: string;
}) {
  const router = useRouter();
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
      const r = await forceSetOwnPassword(next);
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
      setNext("");
      setConfirm("");
    });

  return (
    <div className="flex max-w-sm flex-col gap-3 text-left">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">New password</Label>
        <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Confirm new password</Label>
        <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </div>
      <div>
        <Button size="sm" onClick={submit} disabled={pending || next.trim().length < 8}>
          {mode === "force" ? "Set password & continue" : "Change password"}
        </Button>
      </div>
      {msg ? <p className={`text-sm ${ok ? "text-green-600" : "text-red-500"}`}>{msg}</p> : null}
    </div>
  );
}
