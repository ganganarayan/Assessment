"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Request a password reset. Better Auth mints a 10-min token and fires the
 *  sendResetPassword webhook (→ CRM emails the link). Always shows a generic message
 *  so it never reveals whether an email is registered. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `${window.location.origin}/reset-password` }).catch(() => {});
      setSent(true);
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
        <p className="max-w-sm text-sm text-[var(--muted-foreground)]">
          Enter your email and we&apos;ll send a reset link. It expires in 10 minutes.
        </p>
      </div>
      {sent ? (
        <p className="max-w-sm text-sm text-[var(--foreground)]">
          If an account exists for <span className="font-medium">{email}</span>, a reset link is on its way.
          Check your email.
        </p>
      ) : (
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-1 text-left">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <Button type="submit" disabled={pending || !email.trim()}>{pending ? "Sending…" : "Send reset link"}</Button>
        </form>
      )}
      <Link href="/sign-in" className="text-sm underline">Back to sign in</Link>
    </main>
  );
}
