"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";
import { endImpersonation } from "@/features/auth/actions/session";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSignOut() {
    setLoading(true);
    // Leave impersonation FIRST. The acting-tenant cookie has nothing to do with the
    // session cookie, so without this it outlives the sign-out and the next super
    // admin on this browser opens /admin already inside someone else's workspace.
    await endImpersonation().catch(() => {});
    await authClient.signOut();
    setLoading(false);
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={onSignOut} disabled={loading}>
      {loading ? "Signing out…" : "Sign out"}
    </Button>
  );
}
