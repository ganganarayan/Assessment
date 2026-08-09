"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Consume the reset token from the emailed link and set a new password. Better Auth
 *  rejects an expired (>10 min) or used token. */
function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Better Auth sends the token as ?token=; an invalid-link error may arrive as ?error=.
  const token = params.get("token") ?? "";
  const linkError = params.get("error");
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
      const r = await authClient.resetPassword({ newPassword: pw, token });
      if (r.error) return setMsg(r.error.message ?? "This reset link is invalid or has expired.");
      router.replace("/sign-in?reset=1");
    });
  };

  if (!token || linkError) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="max-w-sm text-sm text-red-500">This reset link is invalid or has expired. Request a new one.</p>
        <Link href="/forgot-password" className="text-sm underline">Request a new link</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1 text-left">
        <Label htmlFor="pw">New password</Label>
        <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
      </div>
      <div className="flex flex-col gap-1 text-left">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </div>
      {msg ? <p className="text-sm text-red-500">{msg}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Set new password"}</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <Suspense fallback={<p className="text-sm text-[var(--muted-foreground)]">Loading…</p>}>
        <ResetForm />
      </Suspense>
    </main>
  );
}
