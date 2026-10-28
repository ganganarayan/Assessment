"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { reactivateMyWorkspace } from "@/features/platform/self-provision";

/**
 * The screen a removed account lands on when it signs back in. It never drops them
 * silently into onboarding: the return is a deliberate choice between starting over
 * and leaving. "Create" clears the deletion and provisions a fresh, empty workspace;
 * "Exit" signs out.
 */
export function WelcomeBack({ name }: { name: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{name ? `Welcome back, ${name}.` : "Welcome back."}</CardTitle>
        <CardDescription>
          Your access to your previous workspace was removed. You can start fresh with a
          new workspace, or exit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr(null);
              const r = await reactivateMyWorkspace();
              if (!r.ok) {
                setErr(r.error);
                return;
              }
              router.push("/w");
              router.refresh();
            })
          }
        >
          {pending ? "Setting up…" : "Create a new workspace"}
        </Button>
        <SignOutButton label="Exit" />
        {err ? (
          <p className="text-sm text-red-500" role="alert">
            {err}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
