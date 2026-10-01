import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { PlatformPixel } from "@/components/platform-pixel";
import { resolvePlatformMetaConfig } from "@/lib/settings/config";

export const dynamic = "force-dynamic";

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
