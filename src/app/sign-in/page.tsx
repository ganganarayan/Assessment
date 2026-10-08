import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { getCurrentTenant } from "@/lib/tenant/context";

/**
 * A login box: nothing to rank for, nothing to answer with, and it was in the sitemap.
 * noindex, follow - the links out of it (the marketing site, the policies) are fine to
 * crawl, the box itself is not worth a crawl.
 */
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

/** Reads the request host to decide whether signing up is offered, so it must never
 *  be prerendered: one cached copy would put a Sign Up link on every tenant domain. */
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  // On a tenant's own domain this is a staff door, not a shop front: accounts are
  // created on the Assess360 site and nowhere else.
  const allowSignUp = !(await getCurrentTenant());

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignInForm allowSignUp={allowSignUp} />
    </main>
  );
}
