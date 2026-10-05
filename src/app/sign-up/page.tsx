import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlatformPixel } from "@/components/platform-pixel";
import { resolvePlatformMetaConfig } from "@/lib/settings/config";
import { platformPageMetadata } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

/**
 * Indexable, unlike /sign-in: "assess360 free trial" is a real query, and this is the
 * page that answers it. The description states the trial exactly as the pricing section
 * does - 14 days, Signal, no card - because a description that oversells the trial is the
 * kind of thing that gets quoted back at us by an AI answer engine.
 */
export const metadata: Metadata = platformPageMetadata({
  title: "Start your 14-day trial",
  description:
    "Create your Assess360 workspace and start a 14-day Signal trial - no card required.",
  path: "/sign-up",
});

/**
 * Signup. Reached directly, or from the platform signup funnel with `?email=&name=`
 * after someone completed the qualification assessment.
 *
 * An email that ALREADY has an account is sent to sign-in rather than shown a form it
 * can only fail: "a user with this email exists" at the end of a funnel reads as being
 * rejected, when they are simply already a customer.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const email = one(sp.email).trim().toLowerCase();
  const name = one(sp.name).trim();

  const session = await getSession();
  if (session) {
    const signedInAs = (session.user.email ?? "").trim().toLowerCase();
    // Same person, or no email to compare: they are already a customer, send them in.
    if (!email || email === signedInAs) redirect("/dashboard");
    // Different person. This browser holds somebody else's session and a prospect has
    // just finished the funnel with their own email. Neither answer is safe to pick
    // for them: continuing silently shows them an account that is not theirs, and
    // signing them out silently ends a session they may still want. So ask.
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>You are already signed in</CardTitle>
            <CardDescription>
              This browser is signed in as <strong>{session.user.email}</strong>, but you just
              entered <strong>{email}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link href="/dashboard" className={buttonVariants({ className: "w-full" })}>
              Continue as {session.user.email}
            </Link>
            <SignOutButton
              redirectTo={`/sign-up?${new URLSearchParams({ email, ...(name ? { name } : {}) }).toString()}`}
              label={`Sign out and create an account for ${email}`}
            />
          </CardContent>
        </Card>
      </main>
    );
  }

  if (email) {
    const existing = await prisma.user
      .findFirst({ where: { email: { equals: email, mode: "insensitive" }, deletedAt: null }, select: { id: true } })
      .catch(() => null);
    if (existing) redirect(`/sign-in?email=${encodeURIComponent(email)}`);
  }

  const { pixelId } = await resolvePlatformMetaConfig();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <PlatformPixel pixelId={pixelId} />
      <SignUpForm prefill={{ name: name || undefined, email: email || undefined }} />
    </main>
  );
}
