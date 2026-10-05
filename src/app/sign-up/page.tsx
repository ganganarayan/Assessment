import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
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
  const session = await getSession();
  if (session) redirect("/dashboard");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const email = one(sp.email).trim().toLowerCase();
  const name = one(sp.name).trim();

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
