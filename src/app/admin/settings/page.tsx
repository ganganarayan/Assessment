import { getAppSetting } from "@/features/events/data";
import { actingTenantId } from "@/lib/tenant/acting";
import { wabaVisible } from "@/lib/nurture/waba-visible";
import { ThemeSelector } from "@/features/admin/components/theme-selector";
import { AbandonedSetting } from "@/features/admin/components/abandoned-setting";
import { IntegrationSettingsForm } from "@/features/workspace/components/integration-settings-form";
import { DomainSettings } from "@/features/workspace/components/domain-settings";
import {
  getIntegrationSettings,
  updateMetaSettings,
  updateRazorpaySettings,
  updateHeatmapSettings,
  updateVidapulseSettings,
} from "@/features/workspace/actions/integrations";
import { HeatmapSettingsForm } from "@/features/workspace/components/heatmap-settings-form";
import { getDomainSettings } from "@/features/workspace/actions/domains";
import {
  getPlatformIntegrationSettings,
  updatePlatformMetaSettings,
  updatePlatformRazorpaySettings,
  updatePlatformHeatmapSettings,
  updatePlatformVidapulseSettings,
  getLegalSettings,
  getPlatformSubscriptionPixel,
} from "@/features/admin/actions/platform-integrations";
import { PlatformPixelForm } from "@/features/admin/components/platform-pixel-form";
import { PaymentsMasterSwitch } from "@/features/admin/components/payments-master-switch";
import { PlatformToggle } from "@/features/admin/components/platform-toggle";
import { getPlatformPayments, getPlatformWaba } from "@/features/admin/actions/platform-integrations";
import { LegalSettingsForm } from "@/features/admin/components/legal-settings-form";
import { NurtureConnectionSettings } from "@/features/nurture/components/nurture-connection-settings";
import { getNurtureSettings } from "@/features/nurture/actions";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { WorkspaceLogins } from "@/features/workspace/components/workspace-logins";
import { listWorkspaceLogins } from "@/features/workspace/actions/logins";
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
 *  - platform/global view    → the singleton row (platform actions; env fallback)
 * Custom domains are per-tenant, so that card only shows while impersonating.
 */
export default async function SettingsPage() {
  const [setting, actingId, nurtureSettings] = await Promise.all([
    getAppSetting(),
    actingTenantId(),
    getNurtureSettings(),
  ]);
  const impersonating = actingId !== null;

  // Resolve the Ads & payments view + a matching domains view for the active scope.
  const [integrations, domains, legal, platformPixel, logins, paymentsOn, showWaba, wabaOn] = await Promise.all([
    impersonating ? getIntegrationSettings() : getPlatformIntegrationSettings(),
    impersonating ? getDomainSettings() : Promise.resolve(null),
    impersonating ? Promise.resolve(null) : getLegalSettings(),
    impersonating ? Promise.resolve(null) : getPlatformSubscriptionPixel(),
    impersonating ? listWorkspaceLogins() : Promise.resolve(null),
    impersonating ? Promise.resolve(true) : getPlatformPayments(),
    wabaVisible(actingId),
    impersonating ? Promise.resolve(false) : getPlatformWaba(),
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
          <CardTitle>Ads &amp; payments {impersonating ? "(this tenant)" : "(platform)"}</CardTitle>
          <CardDescription>
            {impersonating
              ? "Meta Pixel + Conversions API token and Razorpay keys for the tenant you're currently in. Stored encrypted and scoped to that tenant."
              : "The platform's own Meta Pixel + Conversions API token and Razorpay keys. Saved here they override the env vars; leave blank to keep the current env values."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IntegrationSettingsForm
            initial={integrations}
            saveMetaAction={impersonating ? updateMetaSettings : updatePlatformMetaSettings}
            saveRazorpayAction={impersonating ? updateRazorpaySettings : updatePlatformRazorpaySettings}
            saveVidapulseAction={impersonating ? updateVidapulseSettings : updatePlatformVidapulseSettings}
            banner={
              impersonating
                ? "Live for this tenant: its funnel fires this pixel, CAPI sends with this token, and payments run on this Razorpay account. Secrets are encrypted and never shown again."
                : "Platform keys. Values here take priority over the env vars (which stay as the fallback), so the platform can move off env without a redeploy. Secrets are encrypted and never shown again."
            }
          />
        </CardContent>
      </Card>

      {!impersonating ? (
        <Card>
          <CardHeader>
            <CardTitle>Respondent payments (all tenants)</CardTitle>
            <CardDescription>
              Whether tenants may collect money from the people who take their assessments.
              Each tenant has its own switch in the platform console; this one sits above all
              of them. Razorpay is the only gateway we integrate - a tenant using anything
              else sends respondents to their own payment link and back via the Return URL in
              their settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentsMasterSwitch initial={paymentsOn} />
          </CardContent>
        </Card>
      ) : null}

      {!impersonating ? (
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp (all tenants)</CardTitle>
            <CardDescription>
              The WhatsApp sender is parked while it needs template approval and per-tenant
              numbers. Hidden, not deleted: every tenant&apos;s saved WhatsApp settings stay
              exactly where they are, and a hidden sender also stops sending, so nobody is
              running something they can no longer see. Your own internal tenants keep it either
              way.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformToggle
              initial={wabaOn}
              onLabel="visible to every tenant"
              offLabel="hidden from tenants"
              turnOn="Show WhatsApp to tenants"
              turnOff="Hide WhatsApp from tenants"
              action="waba"
            />
          </CardContent>
        </Card>
      ) : null}

      {!impersonating && platformPixel ? (
        <Card>
          <CardHeader>
            <CardTitle>App / subscription pixel (Assess360 SaaS)</CardTitle>
            <CardDescription>
              A separate Meta pixel for the Assess360 SaaS funnel - landing PageView, free
              sign-up CompleteRegistration, and subscription Purchase. Distinct from the funnel
              assessment pixel above. No env fallback: unset means the funnel fires nothing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformPixelForm initial={platformPixel} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Heatmap &amp; session recording {impersonating ? "(this tenant)" : "(platform)"}</CardTitle>
          <CardDescription>
            Paste a recording snippet (e.g. MS Clarity). It runs on every funnel page
            (opt-in → each question → result), so the whole session records -
            {impersonating ? " for the tenant you're currently in." : " for the platform's own assessments."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HeatmapSettingsForm
            initial={integrations.heatmapCode}
            saveAction={impersonating ? updateHeatmapSettings : updatePlatformHeatmapSettings}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nurture connection {impersonating ? "(this tenant)" : "(platform)"}</CardTitle>
          <CardDescription>
            Email (SMTP) + WhatsApp (Meta Cloud API) credentials used for the one-shot message that
            fires on opt-in. Per tenant; secrets are encrypted and never shown again. The messages
            themselves are set under <a className="underline" href="/admin/nurture">Nurture</a>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NurtureConnectionSettings initial={nurtureSettings} showWaba={showWaba} />
        </CardContent>
      </Card>

      {!impersonating && legal ? (
        <Card>
          <CardHeader>
            <CardTitle>Legal &amp; company details</CardTitle>
            <CardDescription>
              Shown only on the public policy pages (Privacy, Terms, Refund) - never on the
              marketing landing. Fill these before going live; blank fields show a placeholder
              on those pages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalSettingsForm initial={legal} />
          </CardContent>
        </Card>
      ) : null}

      {impersonating && domains ? (
        <Card>
          <CardHeader>
            <CardTitle>Custom domains (this tenant)</CardTitle>
            <CardDescription>
              Serve this tenant&apos;s funnel on its own domain. Add a host, point its DNS at us, and
              verify - verified domains route straight to this tenant.
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

      {/* 🔴 While impersonating, "your own password" is the SUPER ADMIN's, not this
          tenant's - the trap that let an owner change their own credentials believing
          they were fixing a locked-out tenant. Inside a workspace the card is this
          workspace's logins instead; your own password lives on the platform console. */}
      {impersonating ? (
        <Card>
          <CardHeader>
            <CardTitle>Workspace logins</CardTitle>
            <CardDescription>
              The people who can sign in to this tenant. Set a password here to get a locked-out
              admin back in - they choose their own on the next sign-in. To change YOUR password,
              exit to the platform first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logins?.ok ? (
              <WorkspaceLogins logins={logins.data ?? []} />
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                {logins?.error ?? "Couldn't load this workspace's logins."}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              Update your own login password. Signs out your other sessions, not this one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
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
