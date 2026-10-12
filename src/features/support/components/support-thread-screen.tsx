import Link from "next/link";
import { notFound } from "next/navigation";
import { type SupportKind } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isStaff, requireSuperAdmin, requireWorkspace } from "@/lib/auth/guards";
import { formatIST } from "@/lib/date";
import { PLATFORM_SUPPORT_EMAIL } from "@/lib/platform-support";
import { resolveSupportRouting } from "@/lib/support/config";
import { KIND_LABEL, STATUS_LABEL, supportRef, TENANT_STATUS_LABEL } from "@/lib/support/model";
import { getThread } from "@/features/support/data";
import { markThreadSeen } from "@/features/support/actions/tenant";
import { ThreadMessages } from "@/features/support/components/thread-messages";
import { TenantReplyBox } from "@/features/support/components/tenant-reply-box";
import { PlatformThreadActions } from "@/features/support/components/platform-thread-actions";

/** One thread, from either side. The pages that use it are a handful of lines each. */

const SECTION = (kind: SupportKind) => (kind === "ONBOARDING" ? "onboarding" : "support");

export async function TenantSupportThread({ kind, id }: { kind: SupportKind; id: string }) {
  const { user, tenantId, impersonating } = await requireWorkspace();
  if (isStaff(user)) notFound();

  const thread = await getThread(id, { tenantId });
  // Wrong kind in the URL is a wrong URL. Serving it anyway would put an onboarding
  // request under the tickets heading and quietly break the back link.
  if (!thread || thread.kind !== kind) notFound();

  // Opening it is what clears this side's badge. Stamped on render, because "read" is
  // the act of looking rather than the act of pressing something. The action itself
  // refuses while impersonating, so an operator looking does not put out the
  // customer's badge.
  await markThreadSeen(thread.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/w/${SECTION(kind)}`} className="text-sm underline">
          Back to {KIND_LABEL[kind].toLowerCase()}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{thread.subject}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <span className="font-mono text-xs">{supportRef(thread.kind, thread.number)}</span>
          <Badge variant="outline">{TENANT_STATUS_LABEL[thread.status]}</Badge>
          <span>{thread.topic}</span>
          <span>raised {formatIST(new Date(thread.createdAt))}</span>
        </p>
      </div>

      {thread.status === "FORWARDED" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Our team replied by email</CardTitle>
            <CardDescription>
              {/* Truthful, deliberately. There is no inbound mail ingestion in this
                  app, so an answer typed into a mail client will never appear here, and
                  a page that kept saying "waiting for a reply" would be a lie a customer
                  sits in front of. */}
              This one moved to email, so the answer is in your inbox and not on this page. Reply to
              that email and it reaches support directly. The conversation so far is below.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conversation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ThreadMessages
            messages={thread.messages}
            requestAttachments={thread.requestAttachments}
            side="tenant"
          />
          {impersonating ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              You are operating this workspace, so this is read-only. Answer it from{" "}
              <Link className="underline" href={`/admin/${SECTION(kind)}/${thread.id}`}>
                the console
              </Link>
              .
            </p>
          ) : thread.status === "FORWARDED" ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Replies here are closed for this one. Write to {PLATFORM_SUPPORT_EMAIL} or answer the
              email you were sent.
            </p>
          ) : (
            <div className="border-t pt-4">
              <TenantReplyBox requestId={thread.id} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export async function PlatformSupportThread({ kind, id }: { kind: SupportKind; id: string }) {
  await requireSuperAdmin();
  const thread = await getThread(id, { platform: true });
  if (!thread || thread.kind !== kind) notFound();

  const routing = await resolveSupportRouting();
  const mode = kind === "ONBOARDING" ? routing.onboarding : routing.support;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/admin/${SECTION(kind)}`} className="text-sm underline">
          Back to {KIND_LABEL[kind].toLowerCase()}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{thread.subject}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <span className="font-mono text-xs">{supportRef(thread.kind, thread.number)}</span>
          <Badge variant="outline">{STATUS_LABEL[thread.status]}</Badge>
          <span>{thread.topic}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Who is asking</CardTitle>
          <CardDescription>
            {thread.tenantName}
            {thread.createdByName ? ` · ${thread.createdByName}` : ""} · {thread.contactEmail}
            {thread.contactWhatsapp ? ` · ${thread.contactWhatsapp}` : " · no WhatsApp number saved"}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-[var(--muted-foreground)]">
          Raised {formatIST(new Date(thread.createdAt))}
          {thread.firstResponseAt ? ` · first answered ${formatIST(new Date(thread.firstResponseAt))}` : " · never answered"}
          {thread.forwardedAt ? ` · forwarded ${formatIST(new Date(thread.forwardedAt))}` : ""}
          {" · "}
          <Link className="underline" href="/platform">
            open the workspace
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conversation</CardTitle>
          <CardDescription>
            Amber blocks are your private notes. The customer never receives or sees them.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ThreadMessages
            messages={thread.messages}
            requestAttachments={thread.requestAttachments}
            side="platform"
          />
          <div className="border-t pt-4">
            <PlatformThreadActions
              requestId={thread.id}
              status={thread.status}
              contactEmail={thread.contactEmail}
              contactWhatsapp={thread.contactWhatsapp}
              webhookReady={!!routing.webhookUrl}
              inAppMode={mode === "IN_APP"}
              inboxEmail={routing.inboxEmail}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
