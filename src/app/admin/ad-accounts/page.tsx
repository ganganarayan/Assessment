import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { getAdAccountsView } from "@/features/admin/actions/ad-account";
import { AdAccountManager } from "@/features/admin/components/ad-account-manager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Super-admin Ad accounts - the same screen as /w/ad-accounts, for the workspace the
 * owner has entered.
 *
 * 🔴 AT PLATFORM SCOPE THERE IS NOTHING TO SHOW, and it says so rather than offering an
 * empty manager. The platform's own pixel is not an ad account: it lives in
 * platformPixelId / platformCapiTokenEnc on the settings singleton and is read by
 * resolvePlatformMetaConfig. Rendering the manager here would let the owner create rows
 * on the Platform tenant that no funnel reads - which is the exact class of thing this
 * phase was built to remove, not to add.
 */
export default async function AdminAdAccountsPage() {
  await requireSuperAdmin();
  const view = await getAdAccountsView();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ad accounts</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          The Meta configurations a workspace runs its funnels against.
        </p>
      </div>

      {view.platformScope ? (
        <Card>
          <CardHeader>
            <CardTitle>Enter a workspace first</CardTitle>
            <CardDescription>
              Ad accounts belong to a workspace. The platform&apos;s own pixel is separate -
              it lives in <Link href="/admin/settings" className="underline">Settings</Link>{" "}
              under the platform pixel, and powers the Assess360 signup funnel rather than a
              customer&apos;s.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-[var(--muted-foreground)]">
            Pick a workspace on <Link href="/platform" className="underline">Platform</Link> and
            press Enter to manage its ad accounts.
          </CardContent>
        </Card>
      ) : (
        <AdAccountManager accounts={view.accounts} limit={view.limit} canEdit={view.canEdit} />
      )}
    </div>
  );
}
