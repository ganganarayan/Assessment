import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listTenants, listUsers, listDeletedUsers } from "@/features/platform/actions";
import { PlatformConsole } from "@/features/platform/components/platform-console";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const me = await requireSuperAdmin();
  const [t, u, d] = await Promise.all([listTenants(), listUsers(), listDeletedUsers()]);
  // Any loader that failed (a transient DB error) surfaces as a banner — the page
  // still renders with whatever loaded, instead of a full-page server crash.
  const loadErrors = [t, u, d].filter((r): r is { ok: false; error: string } => !r.ok).map((r) => r.error);
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
      {loadErrors.length > 0 ? (
        <div className="rounded-md border border-amber-500 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-medium">Some data couldn&apos;t be loaded just now.</p>
          <ul className="mt-1 list-disc pl-5 text-[var(--muted-foreground)]">
            {loadErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <PlatformConsole
        initialTenants={t.ok && t.data ? t.data : []}
        initialUsers={u.ok && u.data ? u.data : []}
        initialDeletedUsers={d.ok && d.data ? d.data : []}
        currentUserId={me.id}
      />
    </main>
  );
}
