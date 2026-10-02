import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SignInForm } from "@/features/auth/components/sign-in-form";

/**
 * A login box: nothing to rank for, nothing to answer with, and it was in the sitemap.
 * noindex, follow — the links out of it (the marketing site, the policies) are fine to
 * crawl, the box itself is not worth a crawl.
 */
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignInForm />
    </main>
  );
}
