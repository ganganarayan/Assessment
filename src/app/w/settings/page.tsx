import { requireWorkspace, canEdit } from "@/lib/auth/guards";
import { featureAllowedFor } from "@/lib/features/release";
import { ViewOnly, ViewOnlyNote } from "@/components/view-only";
import { getIntegrationSettings, updateMetaSettings, updateMetaNotUsed, updateRazorpaySettings, updateRazorpayNonGstSettings, updatePaymentLinkDescription, updateHeatmapSettings, updateVidapulseSettings } from "@/features/workspace/actions/integrations";
import { HeatmapSettingsForm } from "@/features/workspace/components/heatmap-settings-form";
import { getDomainSettings } from "@/features/workspace/actions/domains";
import { getBookingUrl } from "@/features/workspace/actions/booking";
import { getSupportEmail } from "@/features/workspace/actions/support";
import { getThemeColors } from "@/features/workspace/actions/theme";
import { BookingSettingsForm } from "@/features/workspace/components/booking-settings-form";
import { ReportFooterForm } from "@/features/workspace/components/report-footer-form";
import { getReportFooter } from "@/features/workspace/actions/report-footer";
import { SupportSettingsForm } from "@/features/workspace/components/support-settings-form";
import { ThemeColorForm } from "@/features/workspace/components/theme-color-form";
import { BrandLegalForm } from "@/features/workspace/components/brand-legal-form";
import { getBrandLegal } from "@/features/workspace/actions/brand-legal";
import { RegionForm } from "@/features/workspace/components/region-form";
import { getRegion } from "@/features/workspace/actions/region";
import { getAbandonedHours } from "@/features/events/actions/settings";
import { AbandonedSetting } from "@/features/admin/components/abandoned-setting";
import { IntegrationSettingsForm } from "@/features/workspace/components/integration-settings-form";
import { DomainSettings } from "@/features/workspace/components/domain-settings";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { SupportWhatsappForm } from "@/features/support/components/whatsapp-form";
import { NurtureConnectionSettings } from "@/features/nurture/components/nurture-connection-settings";
import { getNurtureSettings } from "@/features/nurture/actions";
import { getWhatsAppConnectInfo } from "@/features/whatsapp/actions";
import { wabaVisible } from "@/lib/nurture/waba-visible";
import { prisma } from "@/lib/db/prisma";
import { isStaff } from "@/lib/auth/guards";
import { WorkspaceLogins } from "@/features/workspace/components/workspace-logins";
import { listWorkspaceLogins } from "@/features/workspace/actions/logins";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Workspace settings. getAiSettings/updateAiSettings/testAi resolve the acting
 * scope, so this reads + writes THIS tenant's AppSetting row - never the platform
 * singleton. An unconfigured tenant simply has no AI (it never borrows Gita's key).
 */
export default async function WorkspaceSettingsPage() {
  const { user, tenantId, impersonating, viaAgency } = await requireWorkspace();
  // Inside someone else's workspace (super admin impersonating, or an agency owner in a
  // client workspace): show THAT workspace's logins, not "change your password".
  const operatingOther = impersonating || viaAgency;
  // VIEW staff read the settings; the forms are greyed out rather than failing on save.
  const readOnly = !canEdit(user);
  // The Test Payment row: released, or an exempt scope (internal workspaces).
  const testPaymentOn = await featureAllowedFor("testPayment", tenantId);
  const integrations = await getIntegrationSettings();
  const domains = await getDomainSettings();
  const bookingUrl = await getBookingUrl();
  const reportFooter = await getReportFooter();
  const supportEmail = await getSupportEmail();
  const themeColors = await getThemeColors();
  const brandLegal = await getBrandLegal();
  const region = await getRegion();
  const abandonedHours = await getAbandonedHours();
  /**
   * Sender credentials for this workspace.
   *
   * These had no tenant-facing screen at all: SMTP and WhatsApp could only be set from
   * /admin, which meant a customer could never connect their own number and the
   * one-click button had nowhere to live for them. The actions were always acting-scoped,
   * so this is a missing card rather than a missing feature.
   */
  const nurtureSettings = await getNurtureSettings();
  const showWaba = await wabaVisible(tenantId);
  const whatsapp = showWaba ? await getWhatsAppConnectInfo() : null;
  // Same trap as /admin: impersonating, "your own password" is the operator's, not
  // this tenant's. Inside someone else's workspace, show THEIR logins instead.
  const logins = operatingOther ? await listWorkspaceLogins() : null;
  /**
   * The WhatsApp number support replies to, read for THIS login.
   *
   * Not shown while a super admin is operating the workspace: the signed-in person is
   * then the operator, and the field would offer to save the operator's own number as
   * the one this customer's tickets notify.
   */
  const me =
    impersonating || isStaff(user)
      ? null
      : await prisma.user.findUnique({ where: { id: user.id }, select: { whatsapp: true } });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Connect your own LLM to write a short, personalized result message for each of
          your respondents. Your key is encrypted at rest, used only for your workspace,
          and never shared with any other tenant or the platform.
        </p>
      </div>
      {readOnly ? <ViewOnlyNote /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Ads &amp; payments</CardTitle>
          <CardDescription>
            Your own Meta Pixel + Conversions API token and Razorpay keys. Stored encrypted and
            scoped to this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViewOnly readOnly={readOnly} bare><IntegrationSettingsForm
            initial={integrations}
            saveMetaAction={updateMetaSettings}
            saveRazorpayAction={updateRazorpaySettings}
            saveRazorpayNonGstAction={updateRazorpayNonGstSettings}
            savePayDescriptionAction={updatePaymentLinkDescription}
            saveVidapulseAction={updateVidapulseSettings}
            saveMetaNotUsedAction={updateMetaNotUsed}
            testPaymentBack={testPaymentOn && !readOnly ? "w" : null}
          /></ViewOnly>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Heatmap &amp; session recording</CardTitle>
          <CardDescription>
            Paste a recording snippet (e.g. MS Clarity) to record every respondent&apos;s session
            across your funnel - opt-in, each question, and the result page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViewOnly readOnly={readOnly} bare><HeatmapSettingsForm initial={integrations.heatmapCode} saveAction={updateHeatmapSettings} /></ViewOnly>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Color</CardTitle>
          <CardDescription>
            Set your brand colors. Applied across your workspace and respondent-facing
            pages, in both light and dark mode.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViewOnly readOnly={readOnly} bare><ThemeColorForm initial={themeColors} /></ViewOnly>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand and legal</CardTitle>
          <CardDescription>
            Your logo, tab icon and share image, your privacy and terms links, and where replies go. This is what your respondents see as yours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViewOnly readOnly={readOnly} bare><BrandLegalForm initial={brandLegal} /></ViewOnly>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Region</CardTitle>
          <CardDescription>Your timezone for bookings and reminders, and the currency your respondents pay in.</CardDescription>
        </CardHeader>
        <CardContent>
          <ViewOnly readOnly={readOnly} bare><RegionForm initial={region} /></ViewOnly>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Abandoned assessments</CardTitle>
          <CardDescription>
            How many hours after someone starts without finishing before they count as abandoned (and your
            abandoned follow-ups and the Meta event fire).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViewOnly readOnly={readOnly} bare><AbandonedSetting hours={abandonedHours} /></ViewOnly>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking / calendar link</CardTitle>
          <CardDescription>
            The scheduling link respondents book through. Powers the &ldquo;Book a
            1-on-1 call&rdquo; button on their results page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViewOnly readOnly={readOnly} bare><BookingSettingsForm initial={bookingUrl} /></ViewOnly>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PDF report footer</CardTitle>
          <CardDescription>What prints at the foot of your respondents&apos; PDF reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <ViewOnly readOnly={readOnly} bare><ReportFooterForm initial={reportFooter.footer} canEdit={reportFooter.canEdit} /></ViewOnly>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Support email</CardTitle>
          <CardDescription>
            The address respondents are pointed to if their results can&apos;t be shown -
            for example when your plan&apos;s monthly response limit is reached.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViewOnly readOnly={readOnly} bare><SupportSettingsForm initial={supportEmail} /></ViewOnly>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sender connection</CardTitle>
          <CardDescription>
            The email and WhatsApp accounts your one-shot opt-in message is sent FROM. Yours alone,
            and never shared with any other workspace. Secrets are encrypted and never shown again.
            The messages themselves are set under <Link className="underline" href="/w/nurture">Nurture</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViewOnly readOnly={readOnly} bare><NurtureConnectionSettings initial={nurtureSettings} showWaba={showWaba} whatsapp={whatsapp} /></ViewOnly>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom domains</CardTitle>
          <CardDescription>
            Serve your funnel on your own domain. Add a host, point its DNS at us, and verify -
            verified domains route straight to this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViewOnly readOnly={readOnly} bare><DomainSettings initial={domains} /></ViewOnly>
        </CardContent>
      </Card>

      {operatingOther ? (
        <Card>
          <CardHeader>
            <CardTitle>Workspace logins</CardTitle>
            <CardDescription>
              The people who can sign in to this workspace. Set a password here to get a locked-out
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

      {me ? (
        <Card>
          <CardHeader>
            <CardTitle>Support notifications</CardTitle>
            <CardDescription>
              Where we tell you a support thread has been answered. Email always goes to your login
              address. A WhatsApp number is optional, used for nothing else, and passed to support
              so they can reach you there instead of waiting on an inbox.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SupportWhatsappForm initial={me.whatsapp ?? ""} />
          </CardContent>
        </Card>
      ) : null}

      {/* System prompt versions used to be duplicated here as well as on /w/ai. Two
          editors over one row is two places to get it wrong, and it doubled the surface
          that had to be scoped correctly. One home: AI. */}
      <Card>
        <CardHeader>
          <CardTitle>System prompt versions</CardTitle>
          <CardDescription>
            Your result-message instructions live under <strong>AI</strong>, together with the
            model settings that use them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/w/ai" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Open AI settings
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
