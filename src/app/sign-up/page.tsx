import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getCurrentTenant } from "@/lib/tenant/context";
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
  // A tenant's own domain does not sell the product. Someone who lands here from an
  // old search result is sent to sign in, which is the only thing this host is for -
  // a 404 would read as a broken site, and the form would be a promise we refuse to
  // keep at the endpoint anyway.
  if (await getCurrentTenant()) redirect("/sign-in");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const email = one(sp.email).trim().toLowerCase();
  const name = one(sp.name).trim();

  const session = await getSession();
  if (session) {
    const signedInAs = (session.user.email ?? "").trim().toLowerCase();
    // A plain visit with a live session: nothing has just happened, send them in.
    if (!email) redirect("/dashboard");

    /**
     * An `email` parameter means A FUNNEL JUST FINISHED, and finishing an assessment
     * is not the same event as signing in. Fusing them is how a tenant testing their
     * own funnel with their own login address gets thrown into the app mid-test, and
     * how a prospect on a shared browser lands in a stranger's workspace. So from here
     * on this page always ACKNOWLEDGES and offers a button; it never teleports.
     *
     * The automatic hop is only wrong when it is automatic. Once they click, taking
     * them to their workspace is exactly what they asked for.
     */
    const samePerson = email === signedInAs;
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{samePerson ? "You already have an account" : "You are already signed in"}</CardTitle>
            <CardDescription>
              {samePerson ? (
                <>
                  That is done. <strong>{session.user.email}</strong> is already set up, so there
                  is nothing to create.
                </>
              ) : (
                <>
                  This browser is signed in as <strong>{session.user.email}</strong>, but you just
                  entered <strong>{email}</strong>.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link href="/dashboard" className={buttonVariants({ className: "w-full" })}>
              {samePerson ? "Go to my workspace" : `Continue as ${session.user.email}`}
            </Link>
            {samePerson ? null : (
              <SignOutButton
                redirectTo={`/sign-up?${new URLSearchParams({ email, ...(name ? { name } : {}) }).toString()}`}
                label={`Sign out and create an account for ${email}`}
              />
            )}
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
