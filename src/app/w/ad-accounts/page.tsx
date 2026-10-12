import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/guards";
import { getAdAccountsView } from "@/features/admin/actions/ad-account";
import { AdAccountManager } from "@/features/admin/components/ad-account-manager";

export const dynamic = "force-dynamic";

/**
 * Workspace Ad accounts - the Meta configurations this workspace runs funnels against.
 *
 * Not plan-gated as a FEATURE: every tier includes at least one ad account, so the
 * screen is where a Gate customer sets up their only pixel as much as where an Agency
 * customer keeps ten apart. The plan decides HOW MANY (enforced in createAdAccount and
 * shown by the meter), never whether the screen exists.
 */
export default async function WorkspaceAdAccountsPage() {
  await requireWorkspace();
  const view = await getAdAccountsView();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ad accounts</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          One entry per Meta ad account you run funnels for: its pixel ID and its
          Conversions API token. Each assessment picks the account it reports to, in step
          11 of the builder, and anything that picks none uses your default.
        </p>
      </div>

      {view.accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-[var(--muted-foreground)]">
          No ad account yet. Add one below - until a pixel and a token are saved, your
          funnels collect leads and report nothing to Meta, which is also why{" "}
          <Link href="/w/assessments" className="underline">publishing</Link> is blocked
          until one exists or you tick &quot;We don&apos;t use Meta&quot; in{" "}
          <Link href="/w/settings" className="underline">Settings</Link>.
        </div>
      ) : null}

      <AdAccountManager accounts={view.accounts} limit={view.limit} canEdit={view.canEdit} />
    </div>
  );
}
