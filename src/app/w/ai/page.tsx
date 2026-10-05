import Link from "next/link";
import { getAiSettings } from "@/features/admin/actions/ai-settings";
import { PromptVersionsManager } from "@/features/admin/components/prompt-versions-manager";
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

export const dynamic = "force-dynamic";

/**
 * Workspace AI - the same LLM connection and prompt versions as /admin/ai, scoped
 * to this workspace. The underlying actions resolve through the acting scope, so a
 * real tenant admin edits their own AppSetting row and a super admin who entered
 * this workspace edits the one they are acting as.
 *
 * Gated on the `aiReports` entitlement (every paid plan has it; FREE does not).
 * A super admin operating the workspace is never gated.
 */
export default async function WorkspaceAiPage() {
  const { tenantId, impersonating } = await requireWorkspace();
  const entitled = impersonating || (await tenantCan(tenantId, "aiReports"));

  if (!entitled) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Write a short, personalized result message for each respondent with your own LLM.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Not included on your plan</CardTitle>
            <CardDescription>
              AI result messages are part of the paid plans. Upgrade to connect a provider and
              write your own prompt versions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/w/billing" className={buttonVariants()}>
              See plans
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const settings = await getAiSettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          A short, personalized result message written for each respondent. On completion the
          raw scores (no internal interpretation) are sent to the model, which returns the
          message in the words you set below. It is generated once, stored on the submission,
          and shown on the result page. The model and its connection are managed for you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System prompt versions</CardTitle>
          <CardDescription>
            Write plain <strong>instructions</strong> per version; the app assembles the full
            system prompt around them. Set one as this workspace&apos;s default; each assessment
            can pick its own in the builder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PromptVersionsManager
            versions={settings.versions}
            wordMin={settings.wordMin}
            wordMax={settings.wordMax}
            sampleName={settings.sampleName}
            showBuiltins={settings.showBuiltins}
          />
        </CardContent>
      </Card>
    </div>
  );
}
