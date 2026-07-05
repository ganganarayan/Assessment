import { requireSuperAdmin } from "@/lib/auth/guards";
import { actingTenantId } from "@/lib/tenant/acting";
import { env } from "@/lib/env";
import { listApiTokens } from "@/features/api-tokens/actions";
import { ApiTokensManager } from "@/features/api-tokens/components/api-tokens-manager";

export const dynamic = "force-dynamic";

export default async function ApiTokensPage() {
  await requireSuperAdmin();
  // Scope to the entered tenant when impersonating; null = platform/Gita.
  const t = await actingTenantId();
  const res = await listApiTokens(t);
  const tokens = res.ok && res.data ? res.data : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">API Tokens</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Scoped bearer keys for external data endpoints. Each key unlocks only its own
          scope (least privilege) and is stored hashed — the plaintext is shown once at
          generation. Use the <span className="font-mono">meta_match</span> scope for the
          n8n CAPI lookup.
        </p>
      </div>
      <ApiTokensManager initialTokens={tokens} endpointBase={env.NEXT_PUBLIC_APP_URL} tenantId={t} />
    </div>
  );
}
