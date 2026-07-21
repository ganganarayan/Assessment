import { getAppSetting } from "@/features/events/data";
import { actingTenantId } from "@/lib/tenant/acting";
import { ThemeSelector } from "@/features/admin/components/theme-selector";
import { AbandonedSetting } from "@/features/admin/components/abandoned-setting";
import { IntegrationSettingsForm } from "@/features/workspace/components/integration-settings-form";
import { DomainSettings } from "@/features/workspace/components/domain-settings";
import {
  getIntegrationSettings,
  updateMetaSettings,
  updateRazorpaySettings,
} from "@/features/workspace/actions/integrations";
import { getDomainSettings } from "@/features/workspace/actions/domains";
import {
  getPlatformIntegrationSettings,
  updatePlatformMetaSettings,
  updatePlatformRazorpaySettings,
} from "@/features/admin/actions/platform-integrations";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Super-admin settings. The Ads & payments card follows the ACTING scope:
 *  - impersonating a tenant  → that tenant's Meta/Razorpay (per-tenant actions)
 *  - platform/global view    → the Gita singleton (platform actions; env fallback)
 * Custom domains are per-tenant, so that card only shows while impersonating.
 */
export default async function SettingsPage() {
  const [setting, actingId] = await Promise.all([getAppSetting(), actingTenantId()]);
  const impersonating = actingId !== null;

  // Resolve the Ads & payments view + a matching domains view for the active scope.
  const [integrations, domains] = await Promise.all([
    impersonating ? getIntegrationSettings() : getPlatformIntegrationSettings(),
    impersonating ? getDomainSettings() : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Light, Dark, or System. Saved to a cookie on this browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ads &amp; payments {impersonating ? "(this tenant)" : "(platform · Gita)"}</CardTitle>
          <CardDescription>
            {impersonating
              ? "Meta Pixel + Conversions API token and Razorpay keys for the tenant you're currently in. Stored encrypted and scoped to that tenant."
              : "Platform (Gita) Meta Pixel + Conversions API token and Razorpay keys. Saved here they override the env vars; leave blank to keep the current env values."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IntegrationSettingsForm
            initial={integrations}
            saveMetaAction={impersonating ? updateMetaSettings : updatePlatformMetaSettings}
            saveRazorpayAction={impersonating ? updateRazorpaySettings : updatePlatformRazorpaySettings}
            banner={
              impersonating
                ? "Live for this tenant: its funnel fires this pixel, CAPI sends with this token, and payments run on this Razorpay account. Secrets are encrypted and never shown again."
                : "Platform/Gita keys. Values here take priority over the env vars (which stay as the fallback), so you can move Gita off env without a redeploy. Secrets are encrypted and never shown again."
            }
          />
        </CardContent>
      </Card>

      {impersonating && domains ? (
        <Card>
          <CardHeader>
            <CardTitle>Custom domains (this tenant)</CardTitle>
            <CardDescription>
              Serve this tenant&apos;s funnel on its own domain. Add a host, point its DNS at us, and
              verify — verified domains route straight to this tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DomainSettings initial={domains} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Custom domains</CardTitle>
            <CardDescription>
              Custom domains are per-tenant. Enter a tenant (Platform → open a tenant) to add and
              verify its domains.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Abandoned assessments</CardTitle>
          <CardDescription>
            Hours after a lead starts (without completing) before
            <span className="font-mono"> assessment.abandoned</span> is emitted by
            the sweep.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AbandonedSetting hours={setting?.abandonedAfterHours ?? 24} />
        </CardContent>
      </Card>
    </div>
  );
}
