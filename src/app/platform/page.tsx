import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listTenants, listUsers } from "@/features/platform/actions";
import { PlatformConsole } from "@/features/platform/components/platform-console";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const me = await requireSuperAdmin();
  const [t, u] = await Promise.all([listTenants(), listUsers()]);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform console</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Super admin · create tenants and assign logins. Assessment work happens inside each
            tenant&apos;s own workspace (coming in the next stage).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm underline">
            Assessment admin →
          </Link>
          <SignOutButton />
        </div>
      </div>
      <PlatformConsole
        initialTenants={t.ok && t.data ? t.data : []}
        initialUsers={u.ok && u.data ? u.data : []}
        currentUserId={me.id}
      />
    </main>
  );
}
