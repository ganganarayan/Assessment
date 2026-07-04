import { requireWorkspace } from "@/lib/auth/guards";
import { getAiSettings } from "@/features/admin/actions/ai-settings";
import { AiSettingsForm } from "@/features/admin/components/ai-settings-form";
import { StatementStudio } from "@/features/admin/components/statement-studio";
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
 * scope, so this reads + writes THIS tenant's AppSetting row — never the platform
 * singleton. An unconfigured tenant simply has no AI (it never borrows Gita's key).
 */
export default async function WorkspaceSettingsPage() {
  await requireWorkspace();
  const settings = await getAiSettings();

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
          <CardTitle>AI — LLM connection</CardTitle>
          <CardDescription>
            Choose a provider and paste its API key. The key is encrypted at rest and never
            shown again. Disable any time to fall back to the static suggestion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AiSettingsForm initial={settings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statement studio</CardTitle>
          <CardDescription>
            Preview the framed result and compare prompt versions on a sample respondent
            using your saved key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatementStudio
            versions={settings.versions}
            sampleName={settings.sampleName}
            sampleEasyRead={settings.sampleEasyRead}
          />
        </CardContent>
      </Card>
    </div>
  );
}
