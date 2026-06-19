import { getAiSettings } from "@/features/admin/actions/ai-settings";
import { AiSettingsForm } from "@/features/admin/components/ai-settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const settings = await getAiSettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Connect an LLM to write a short, personalized result message for each respondent. On
          completion, the raw scores (no internal interpretation) are sent to the model, which
          returns a 100–150 word message. It&apos;s generated once, stored on the submission, and
          shown above your video via the destination connector.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LLM connection</CardTitle>
          <CardDescription>
            Choose a provider and paste its API key. The key is encrypted at rest and never shown
            again. Disable any time to fall back to the static suggestion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AiSettingsForm initial={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
