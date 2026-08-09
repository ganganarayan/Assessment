import { requireUser, isSuperAdmin } from "@/lib/auth/guards";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";

export const dynamic = "force-dynamic";

/**
 * Forced password change. Reachable by any signed-in user (uses requireUser, which is
 * NOT gated by enforceAccountState, so the force-change redirect can't loop here).
 * After setting their own password, the user continues to their home surface.
 */
export default async function ChangePasswordPage() {
  const user = await requireUser();
  const home = isSuperAdmin(user) ? "/platform" : "/w";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
        <p className="max-w-sm text-sm text-[var(--muted-foreground)]">
          For your security, please choose a new password before continuing.
        </p>
      </div>
      <ChangePasswordForm redirectTo={home} />
    </main>
  );
}
