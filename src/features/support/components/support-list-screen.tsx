import Link from "next/link";
import { type SupportKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isStaff, requireSuperAdmin, requireWorkspace } from "@/lib/auth/guards";
import {
  PLATFORM_SUPPORT_EMAIL,
  PLATFORM_SUPPORT_WHATSAPP,
  PLATFORM_SUPPORT_WHATSAPP_LINK,
} from "@/lib/platform-support";
import { resolveSupportRouting } from "@/lib/support/config";
import { KIND_LABEL, KIND_NOUN } from "@/lib/support/model";
import { listRequests } from "@/features/support/data";
import { RaiseForm } from "@/features/support/components/raise-form";
import { RequestList } from "@/features/support/components/request-list";

/**
 * One list screen, rendered four times: tickets and onboarding, tenant and owner.
 *
 * The four pages that use it are ten lines each, which is the point. Four copies of a
 * queue screen is four places to fix the day the status wording changes.
 */

const SECTION = (kind: SupportKind) => (kind === "ONBOARDING" ? "onboarding" : "support");

export async function TenantSupportList({ kind }: { kind: SupportKind }) {
  const { user, tenantId, impersonating } = await requireWorkspace();

  // 🔴 Owner only. Read-only staff enforcement is not wired across the app yet, and a
  // thread carries the owner's replies about this workspace's billing and setup.
  if (isStaff(user)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{KIND_LABEL[kind]}</CardTitle>
          <CardDescription>
            Support threads are open to the workspace owner only. Ask them to raise it, or write to{" "}
            {PLATFORM_SUPPORT_EMAIL}.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const routing = await resolveSupportRouting();
  const mode = kind === "ONBOARDING" ? routing.onboarding : routing.support;
  const [rows, me] = await Promise.all([
    listRequests(kind, tenantId),
    prisma.user.findUnique({ where: { id: user.id }, select: { whatsapp: true } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {kind === "ONBOARDING" ? "Onboarding support" : "Raise a ticket"}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {kind === "ONBOARDING"
            ? "Ask us to set it up with you. Your first scorecard, the gate, the pixel, the audiences, the domain."
            : "Something not working, or not behaving as you expected. We answer in here and email you when we do."}
        </p>
      </div>

      {impersonating ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">You are operating this workspace</CardTitle>
            <CardDescription>
              {/* Reading is useful here; writing is not. A request raised from inside
                  somebody else's workspace would record the operator as the person to
                  answer, and a reply would appear as though the customer wrote it. */}
              Their threads are below, read-only. Answer them from{" "}
              <Link className="underline" href={`/admin/${SECTION(kind)}`}>
                the console
              </Link>
              , where the reply goes out as Assess360.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : mode === "OFF" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New requests are closed right now</CardTitle>
            <CardDescription>
              Write to {PLATFORM_SUPPORT_EMAIL}, or WhatsApp{" "}
              <a className="underline" href={PLATFORM_SUPPORT_WHATSAPP_LINK} target="_blank" rel="noreferrer">
                {PLATFORM_SUPPORT_WHATSAPP}
              </a>
              . Anything already open below is still being read.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New {KIND_NOUN[kind]}</CardTitle>
            <CardDescription>
              {mode === "EMAIL"
                ? "Our support team answers these by email, so watch your inbox for the reply rather than this page."
                : "Pick the closest topic, say what happened, and attach a screenshot if you have one."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RaiseForm kind={kind} hasWhatsapp={!!me?.whatsapp} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Yours</CardTitle>
          <CardDescription>Newest activity first. Open one to read the reply.</CardDescription>
        </CardHeader>
        <CardContent>
          <RequestList rows={rows} basePath={`/w/${SECTION(kind)}`} side="tenant" />
        </CardContent>
      </Card>
    </div>
  );
}

export async function PlatformSupportList({ kind }: { kind: SupportKind }) {
  await requireSuperAdmin();
  const routing = await resolveSupportRouting();
  const mode = kind === "ONBOARDING" ? routing.onboarding : routing.support;
  const rows = await listRequests(kind, null);

  const waiting = rows.filter((r) => r.status === "OPEN" || r.status === "AWAITING_US").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{KIND_LABEL[kind]}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {waiting} waiting on us · mode{" "}
          {mode === "IN_APP" ? "in-app" : mode === "EMAIL" ? `forwarded to ${routing.inboxEmail}` : "closed"} ·{" "}
          <Link className="underline" href="/admin/settings">
            change it in Settings
          </Link>
        </p>
      </div>

      {mode !== "IN_APP" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {mode === "EMAIL" ? "This queue is handled by email" : "This queue is closed to new requests"}
            </CardTitle>
            <CardDescription>
              {mode === "EMAIL"
                ? "New requests are forwarded to the support inbox and the rail is not badged, so this screen is the record rather than the work."
                : "Tenants cannot raise new ones. Threads already open are still answerable here."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">The queue</CardTitle>
          <CardDescription>
            Red means the customer spoke last. Open threads sit above the finished ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RequestList rows={rows} basePath={`/admin/${SECTION(kind)}`} side="platform" />
        </CardContent>
      </Card>
    </div>
  );
}
