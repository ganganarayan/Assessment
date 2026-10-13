"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type IntegrationSettingsView } from "@/features/workspace/actions/integrations";

type SaveResult = { ok: boolean; error?: string };
type SaveMeta = (pixelId: string, capiToken: string) => Promise<SaveResult>;
type SaveRazorpay = (keyId: string, keySecret: string, webhookSecret: string) => Promise<SaveResult>;
type SaveVidapulse = (param: string, enabled: boolean) => Promise<SaveResult>;
type SavePayDescription = (text: string) => Promise<SaveResult>;
type SaveMetaNotUsed = (notUsed: boolean) => Promise<SaveResult>;

/**
 * Shared Meta + Razorpay key editor. The SAVE actions are injected so the same form
 * drives three scopes: a tenant workspace, a super admin impersonating a tenant
 * (both use the per-tenant actions), and the platform/Gita singleton (platform
 * actions). Secrets are write-only - never round-tripped to the client.
 */
export function IntegrationSettingsForm({
  initial,
  saveMetaAction,
  saveRazorpayAction,
  saveRazorpayNonGstAction,
  savePayDescriptionAction,
  saveVidapulseAction,
  saveMetaNotUsedAction,
  banner,
  showMeta = true,
}: {
  initial: IntegrationSettingsView;
  saveMetaAction: SaveMeta;
  saveRazorpayAction: SaveRazorpay;
  /** The second, non-GST account. Same shape, different columns. */
  saveRazorpayNonGstAction: SaveRazorpay;
  savePayDescriptionAction: SavePayDescription;
  saveVidapulseAction: SaveVidapulse;
  /** Supplied by a TENANT scope only. The publish lock is a tenant rule, so the
   *  platform row has no opt-out to offer and the control is simply absent there. */
  saveMetaNotUsedAction?: SaveMetaNotUsed;
  banner?: string;
  /**
   * Whether this scope keeps its Meta pixel here.
   *
   * A TENANT does: this is their only pixel. The PLATFORM does not - its pixel
   * lives in the one block below, and having a second field here is what let the
   * same pixel be entered twice and fire one event from two senders.
   */
  showMeta?: boolean;
}) {
  const [pixelId, setPixelId] = useState(initial.metaPixelId);
  const [capiToken, setCapiToken] = useState("");
  const [metaNotUsed, setMetaNotUsed] = useState(initial.metaNotUsed);
  const [keyId, setKeyId] = useState(initial.razorpayKeyId);
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [ngKeyId, setNgKeyId] = useState(initial.razorpayNonGstKeyId);
  const [ngKeySecret, setNgKeySecret] = useState("");
  const [ngWebhookSecret, setNgWebhookSecret] = useState("");
  const [payDescription, setPayDescription] = useState(initial.paymentLinkDescription);
  const [vpParam, setVpParam] = useState(initial.vidapulseParam);
  const [vpEnabled, setVpEnabled] = useState(initial.vidapulseTrackingEnabled);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const saveMeta = () =>
    start(async () => {
      setMsg(null);
      const r = await saveMetaAction(pixelId, capiToken);
      setMsg(r.ok ? "Meta settings saved." : r.error ?? "Something went wrong.");
      if (r.ok) setCapiToken("");
    });

  const saveRazorpay = () =>
    start(async () => {
      setMsg(null);
      const r = await saveRazorpayAction(keyId, keySecret, webhookSecret);
      setMsg(r.ok ? "Razorpay settings saved." : r.error ?? "Something went wrong.");
      if (r.ok) {
        setKeySecret("");
        setWebhookSecret("");
      }
    });

  const saveRazorpayNonGst = () =>
    start(async () => {
      setMsg(null);
      const r = await saveRazorpayNonGstAction(ngKeyId, ngKeySecret, ngWebhookSecret);
      setMsg(r.ok ? "Non-GST Razorpay settings saved." : r.error ?? "Something went wrong.");
      if (r.ok) {
        setNgKeySecret("");
        setNgWebhookSecret("");
      }
    });

  const savePayDescription = () =>
    start(async () => {
      setMsg(null);
      const r = await savePayDescriptionAction(payDescription);
      setMsg(r.ok ? "Payment page description saved." : r.error ?? "Something went wrong.");
    });

  const saveVidapulse = () =>
    start(async () => {
      setMsg(null);
      const r = await saveVidapulseAction(vpParam, vpEnabled);
      setMsg(r.ok ? "VidaPulse settings saved." : r.error ?? "Something went wrong.");
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border-l-2 border-green-500 bg-green-500/5 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        {banner ??
          "These keys are live for this workspace: your funnel fires your own Meta pixel, the Conversions API sends with your token, and payments run on your Razorpay account. Secrets are encrypted and never shown again."}
      </div>

      {/* Meta */}
      {showMeta ? (
      <div className="flex flex-col gap-3">
        {/* Which account these two fields edit. Without this line a workspace running
            several ad accounts reads one pixel field here and reasonably concludes it is
            THE pixel - then changes it and wonders why one funnel never moved. */}
        {initial.adAccountCount > 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            {initial.adAccountCount === 1 ? (
              <>
                These are the credentials of your ad account
                {initial.defaultAdAccountLabel ? <strong> {initial.defaultAdAccountLabel}</strong> : null}. Running more than one?{" "}
                <a href="/w/ad-accounts" className="underline">Ad accounts</a> holds them all.
              </>
            ) : (
              <>
                You have {initial.adAccountCount} ad accounts. These fields edit your DEFAULT one
                {initial.defaultAdAccountLabel ? <strong> ({initial.defaultAdAccountLabel})</strong> : null} - the
                one a funnel uses when it names none. Edit the others on{" "}
                <a href="/w/ad-accounts" className="underline">Ad accounts</a>.
              </>
            )}
          </p>
        ) : null}
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Meta Pixel ID</Label>
          <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="e.g. 1129238316012161" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">
            Meta CAPI access token {initial.hasCapiToken ? <span className="text-green-600">(saved - leave blank to keep)</span> : null}
          </Label>
          <Input
            type="password"
            value={capiToken}
            onChange={(e) => setCapiToken(e.target.value)}
            placeholder={initial.hasCapiToken ? "••••••••" : "Paste your Conversions API token"}
          />
        </div>
        <div>
          <Button size="sm" onClick={saveMeta} disabled={pending}>Save Meta settings</Button>
        </div>

        {/* The publish lock's escape hatch. Saved on change rather than behind the
            button above: that button means "here are my credentials", and this means
            "I am not going to give you any". Pressing Save on two empty fields to
            express that would read like a mistake. */}
        {saveMetaNotUsedAction ? (
          <div className="rounded-md border p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={metaNotUsed}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.checked;
                  setMetaNotUsed(next);
                  start(async () => {
                    setMsg(null);
                    const r = await saveMetaNotUsedAction(next);
                    if (!r.ok) {
                      setMetaNotUsed(!next);
                      setMsg(r.error ?? "Something went wrong.");
                    } else {
                      setMsg(
                        next
                          ? "Saved. You can publish without a pixel."
                          : "Saved. Publishing now needs a pixel ID and a CAPI token.",
                      );
                    }
                  });
                }}
              />
              <span>
                <span className="font-medium">We don&apos;t use Meta</span>
                <span className="block text-[var(--muted-foreground)]">
                  Leave this unticked and you cannot publish a funnel until both fields above are filled in.
                  That is on purpose: a published funnel with no pixel collects leads and reports nothing to
                  your ad account, which looks exactly like a funnel that is not working.
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </div>
      ) : null}

      {/* Razorpay, account one: GST. These are the columns the funnel has always
          used, relabelled rather than moved - renaming a live money column buys a
          migration and risks a silent blank. */}
      <div className="flex flex-col gap-3 border-t pt-4">
        <p className="text-sm font-medium">Razorpay - GST account</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Your main account: funnel payments and payment links run on this one unless you pick the
          other. Leave it blank if you do not collect money here.
        </p>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Key ID</Label>
          <Input value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_live_..." />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">
            Key secret {initial.hasRazorpaySecret ? <span className="text-green-600">(saved)</span> : null}
          </Label>
          <Input type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} placeholder={initial.hasRazorpaySecret ? "••••••••" : "Key secret"} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">
            Webhook secret {initial.hasRazorpayWebhookSecret ? <span className="text-green-600">(saved)</span> : null}
          </Label>
          <Input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={initial.hasRazorpayWebhookSecret ? "••••••••" : "Webhook signing secret"} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Webhook URL (point Razorpay → Settings → Webhooks here)</Label>
          <Input readOnly value={initial.webhookUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <p className="text-xs text-[var(--muted-foreground)]">Events: payment.captured and payment_link.paid.</p>
        </div>
        <div>
          <Button size="sm" onClick={saveRazorpay} disabled={pending}>Save GST Razorpay settings</Button>
        </div>
      </div>

      {/* Razorpay, account two: non-GST. Optional, like the first - a workspace may
          hold one, both or neither, and nothing in the product demands either. */}
      <div className="flex flex-col gap-3 border-t pt-4">
        <p className="text-sm font-medium">Razorpay - Non-GST account</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          A second account for clients who will not pay GST on top. Optional, and it is chosen per
          payment link, so nothing moves to it by itself.{" "}
          <strong>Never used for your Assess360 subscription</strong> - that is always billed on the
          account above.
        </p>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Key ID</Label>
          <Input value={ngKeyId} onChange={(e) => setNgKeyId(e.target.value)} placeholder="rzp_live_..." />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">
            Key secret {initial.hasRazorpayNonGstSecret ? <span className="text-green-600">(saved)</span> : null}
          </Label>
          <Input
            type="password"
            value={ngKeySecret}
            onChange={(e) => setNgKeySecret(e.target.value)}
            placeholder={initial.hasRazorpayNonGstSecret ? "••••••••" : "Key secret"}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">
            Webhook secret{" "}
            {initial.hasRazorpayNonGstWebhookSecret ? <span className="text-green-600">(saved)</span> : null}
          </Label>
          <Input
            type="password"
            value={ngWebhookSecret}
            onChange={(e) => setNgWebhookSecret(e.target.value)}
            placeholder={initial.hasRazorpayNonGstWebhookSecret ? "••••••••" : "Webhook signing secret"}
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Point this account&apos;s webhook at the SAME URL as the one above - we check the signature
            against both accounts and record which one took the money.
          </p>
        </div>
        <div>
          <Button size="sm" onClick={saveRazorpayNonGst} disabled={pending}>Save Non-GST Razorpay settings</Button>
        </div>
      </div>

      {/* What the client reads on a payment page. Editable because it is the tenant's
          business name on someone else's card statement, not ours. */}
      <div className="flex flex-col gap-3 border-t pt-4">
        <p className="text-sm font-medium">Payment page description</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Shown on every payment link you send and on the client&apos;s Razorpay receipt. Blank uses the
          assessment&apos;s name.
        </p>
        <div className="flex flex-col gap-1">
          <Input
            value={payDescription}
            onChange={(e) => setPayDescription(e.target.value)}
            maxLength={200}
            placeholder="e.g. Consulting retainer - Divine Leads"
          />
        </div>
        <div>
          <Button size="sm" onClick={savePayDescription} disabled={pending}>Save description</Button>
        </div>
      </div>

      {/* External gateway. Deliberately AFTER Razorpay: a tenant who fills in keys
          above never needs this, and the return URL only resolves the browser, not
          the payment. */}
      <div className="flex flex-col gap-3 border-t pt-4">
        <p className="text-sm font-medium">Using a different payment gateway</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          If you collect payment with your own payment link somewhere else, paste the address
          below as the <strong>success</strong> or <strong>redirect</strong> URL on that link.
          Respondents come back here and we take them straight to their results.
        </p>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Return URL (paste into your payment link&apos;s success redirect)</Label>
          <Input
            readOnly
            value={initial.paymentReturnUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Same address for every respondent, which is all a payment link allows. If someone
            returns in a different browser we ask for their email and match them that way. If
            your gateway adds its own reference to the redirect, name that parameter in the
            assessment&apos;s payment settings and we will record it.
          </p>
        </div>
      </div>

      {/* VidaPulse */}
      <div className="flex flex-col gap-3 border-t pt-4">
        <p className="text-sm font-medium">VidaPulse video tracking</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Passes the respondent&apos;s opaque customer ID (no name/email/phone) into the VSL
          video embed on the result page, so VidaPulse can match its own viewer to this person.
          In VidaPulse, capture this URL parameter against the customer.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={vpEnabled} onChange={(e) => setVpEnabled(e.target.checked)} />
          Add the customer ID to VidaPulse embeds
        </label>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">URL parameter name</Label>
          <Input value={vpParam} onChange={(e) => setVpParam(e.target.value)} placeholder="cid" className="font-mono text-xs" />
          <p className="text-xs text-[var(--muted-foreground)]">Default is cid - e.g. the embed loads as …/embed/&lt;id&gt;?cid=&lt;customer id&gt;.</p>
        </div>
        <div>
          <Button size="sm" onClick={saveVidapulse} disabled={pending}>Save VidaPulse settings</Button>
        </div>
      </div>

      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
    </div>
  );
}
