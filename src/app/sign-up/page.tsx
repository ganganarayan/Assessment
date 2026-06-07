import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

export default async function SignUpPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignUpForm />
    </main>
  );
}
