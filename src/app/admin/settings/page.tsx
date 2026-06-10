import { getAppSetting } from "@/features/events/data";
import { ThemeSelector } from "@/features/admin/components/theme-selector";
import { AbandonedSetting } from "@/features/admin/components/abandoned-setting";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const setting = await getAppSetting();

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
