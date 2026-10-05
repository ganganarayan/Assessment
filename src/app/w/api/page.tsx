import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/guards";
import { tenantCan } from "@/lib/billing/entitlements";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { env } from "@/lib/env";
import { listApiTokens } from "@/features/api-tokens/actions";
import { ApiTokensManager } from "@/features/api-tokens/components/api-tokens-manager";

export const dynamic = "force-dynamic";

export default async function WorkspaceApiTokensPage() {
  const { tenantId, impersonating } = await requireWorkspace();

  // Guarded on the ROUTE, not just hidden in the nav. A bearer key that reads a
  // workspace's leads is exactly the thing that must not be reachable by typing the
  // URL. A super admin operating the workspace is never gated.
  if (!impersonating && !(await tenantCan(tenantId, "apiAccess"))) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">API Tokens</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Scoped bearer keys for reading your leads from your own systems.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Not included on your plan</CardTitle>
            <CardDescription>
              API access is part of <strong>Agency</strong>. Webhooks, which push each new
              lead to your system as it arrives, are on every plan and cover most of what
              people reach for an API to do.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link href="/w/billing" className={buttonVariants({ size: "sm" })}>
              See plans
            </Link>
            <Link href="/w/webhooks" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Set up a webhook
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const res = await listApiTokens(tenantId);
  const tokens = res.ok && res.data ? res.data : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">API Tokens</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Scoped bearer keys for external data endpoints. Each key is bound to this
          workspace - it only ever reads <strong>your</strong> leads - and is stored
          hashed (the plaintext is shown once at generation).
        </p>
      </div>
      <ApiTokensManager
        initialTokens={tokens}
        endpointBase={env.NEXT_PUBLIC_APP_URL}
        tenantId={tenantId}
        allowedScopes={["meta_match"]}
      />
    </div>
  );
}
