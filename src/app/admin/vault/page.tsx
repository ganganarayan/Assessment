import { requireSuperAdmin } from "@/lib/auth/guards";
import { listVaultBuckets } from "@/features/vault/actions";
import { VaultConsole } from "@/features/vault/components/vault-console";

export const dynamic = "force-dynamic";

/**
 * The Vault - the install's own file store on Cloudflare R2.
 *
 * Super admin only, by the same guard as the platform console. Separate from the app's
 * own upload bucket on purpose: this one is a file manager a person drives, whose links
 * get pasted into other products.
 */
export default async function VaultPage() {
  await requireSuperAdmin();
  const buckets = await listVaultBuckets();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Vault</h1>
        <p className="text-sm text-muted-foreground">
          Buckets, folders and files on Cloudflare R2. Upload a video here, copy its link, and hand
          that link to VidaPulse or an LMS. Renaming a file or moving it between folders never
          changes its link, so anything already pasted into a page keeps working.
        </p>
      </div>

      {buckets.ok ? (
        <VaultConsole initialBuckets={buckets.data ?? []} />
      ) : (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          🔴 {buckets.error}
        </p>
      )}
    </main>
  );
}
