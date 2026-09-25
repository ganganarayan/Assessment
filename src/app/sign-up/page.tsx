import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { PlatformPixel } from "@/components/platform-pixel";
import { resolvePlatformMetaConfig } from "@/lib/settings/config";

export default async function SignUpPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const { pixelId } = await resolvePlatformMetaConfig();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <PlatformPixel pixelId={pixelId} />
      <SignUpForm />
    </main>
  );
}
