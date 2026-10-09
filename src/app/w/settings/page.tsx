import { requireWorkspace } from "@/lib/auth/guards";
import { getIntegrationSettings, updateMetaSettings, updateMetaNotUsed, updateRazorpaySettings, updateHeatmapSettings, updateVidapulseSettings } from "@/features/workspace/actions/integrations";
import { HeatmapSettingsForm } from "@/features/workspace/components/heatmap-settings-form";
import { getDomainSettings } from "@/features/workspace/actions/domains";
import { getBookingUrl } from "@/features/workspace/actions/booking";
import { getSupportEmail } from "@/features/workspace/actions/support";
import { getThemeColors } from "@/features/workspace/actions/theme";
import { BookingSettingsForm } from "@/features/workspace/components/booking-settings-form";
import { SupportSettingsForm } from "@/features/workspace/components/support-settings-form";
import { ThemeColorForm } from "@/features/workspace/components/theme-color-form";
import { IntegrationSettingsForm } from "@/features/workspace/components/integration-settings-form";
import { DomainSettings } from "@/features/workspace/components/domain-settings";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { SupportWhatsappForm } from "@/features/support/components/whatsapp-form";
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
  const { user, impersonating } = await requireWorkspace();
  const integrations = await getIntegrationSettings();
  const domains = await getDomainSettings();
  const bookingUrl = await getBookingUrl();
  const supportEmail = await getSupportEmail();
  const themeColors = await getThemeColors();
  // Same trap as /admin: impersonating, "your own password" is the operator's, not
  // this tenant's. Inside someone else's workspace, show THEIR logins instead.
  const logins = impersonating ? await listWorkspaceLogins() : null;
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

      <Card>
        <CardHeader>
          <CardTitle>Ads &amp; payments</CardTitle>
          <CardDescription>
            Your own Meta Pixel + Conversions API token and Razorpay keys. Stored encrypted and
            scoped to this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IntegrationSettingsForm
            initial={integrations}
            saveMetaAction={updateMetaSettings}
            saveRazorpayAction={updateRazorpaySettings}
            saveVidapulseAction={updateVidapulseSettings}
            saveMetaNotUsedAction={updateMetaNotUsed}
          />
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
          <HeatmapSettingsForm initial={integrations.heatmapCode} saveAction={updateHeatmapSettings} />
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
          <ThemeColorForm initial={themeColors} />
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
          <BookingSettingsForm initial={bookingUrl} />
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
          <SupportSettingsForm initial={supportEmail} />
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
          <DomainSettings initial={domains} />
        </CardContent>
      </Card>

      {impersonating ? (
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
