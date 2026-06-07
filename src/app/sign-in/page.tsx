import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SignInForm } from "@/features/auth/components/sign-in-form";

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignInForm />
    </main>
  );
}
