"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forceSetOwnPassword } from "@/features/auth/actions/password";

/** Forced password change (after a super admin set a temporary password). */
export function ChangePasswordForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) return setMsg("Password must be at least 8 characters.");
    if (pw !== confirm) return setMsg("Passwords don't match.");
    start(async () => {
      const r = await forceSetOwnPassword(pw);
      if (!r.ok) return setMsg(r.error);
      router.replace(redirectTo);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="pw">New password</Label>
        <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </div>
      {msg ? <p className="text-sm text-red-500">{msg}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Set new password"}</Button>
    </form>
  );
}
