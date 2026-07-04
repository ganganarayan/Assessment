import { PixelTester } from "@/features/events/components/pixel-tester";
import { CapiTester } from "@/features/events/components/capi-tester";
import { ManualPurchaseResend } from "@/features/events/components/manual-purchase-resend";
import { PurchaseRecovery } from "@/features/events/components/purchase-recovery";
import { CapiLogPanel } from "@/features/events/components/capi-log-panel";
import { listRecentPurchases, listCapiLogs } from "@/features/events/data";
import { getPurchaseSettingsForm } from "@/features/events/actions/capi-test";

export const dynamic = "force-dynamic";

export default async function PixelTestPage() {
  // /admin pixel tester is the platform/Gita console → null-tenant records.
  const purchases = await listRecentPurchases(null);
  const capiLogs = await listCapiLogs(null);
  const purchaseSettings = await getPurchaseSettingsForm();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pixel Tester</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Fire a Meta Pixel event from your browser so it registers in Events Manager and
          becomes selectable as a conversion event. Standard events (e.g. PageView,
          CompleteRegistration) use <span className="font-mono">track</span>; anything else
          (e.g. <span className="font-mono">AssessmentCompleted</span>) uses{" "}
          <span className="font-mono">trackCustom</span>.
        </p>
      </div>

      <PixelTester />

      <CapiTester />

      <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-3 text-xs text-[var(--muted-foreground)]">
        <strong className="text-[var(--foreground)]">Purchase dedup rule.</strong> This app fires the
        server <span className="font-mono">Purchase</span> conversion. Your external thank-you page&apos;s
        browser Purchase pixel <strong>must use the exact same</strong> event name{" "}
        <span className="font-mono">Purchase</span> <strong>and</strong>{" "}
        <span className="font-mono">eventID = the Razorpay payment id</span> — otherwise Meta counts the
        sale twice. Also set the assessment&apos;s <strong>Price (₹) = 199</strong>: the auto-fire on
        external captures only fires when the captured amount equals that price.
      </div>

      <CapiLogPanel initialLogs={capiLogs} initialSettings={purchaseSettings} />

      <ManualPurchaseResend />

      <PurchaseRecovery purchases={purchases} />

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-[var(--muted-foreground)]">
        <strong className="text-[var(--foreground)]">Testing only.</strong> Events go to the
        real pixel, so fire each one <strong>once</strong> just to register it — then it shows
        up in Events Manager (and the Ads Manager conversion-event dropdown) within a few
        minutes. Don&apos;t spam it; repeated fires add test data to your pixel. Verify in
        Events Manager → <em>Test Events</em> or the Meta Pixel Helper.
      </div>
    </div>
  );
}
