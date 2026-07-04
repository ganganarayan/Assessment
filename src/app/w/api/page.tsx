import { requireWorkspace } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { listApiTokens } from "@/features/api-tokens/actions";
import { ApiTokensManager } from "@/features/api-tokens/components/api-tokens-manager";

export const dynamic = "force-dynamic";

export default async function WorkspaceApiTokensPage() {
  const { tenantId } = await requireWorkspace();
  const res = await listApiTokens(tenantId);
  const tokens = res.ok && res.data ? res.data : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">API Tokens</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Scoped bearer keys for external data endpoints. Each key is bound to this
          workspace — it only ever reads <strong>your</strong> leads — and is stored
          hashed (the plaintext is shown once at generation).
        </p>
      </div>
      <ApiTokensManager initialTokens={tokens} endpointBase={env.NEXT_PUBLIC_APP_URL} tenantId={tenantId} />
    </div>
  );
}
