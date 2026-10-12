import { prisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage/r2";
import { getCurrentUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/guards";
import { readActingTenant } from "@/lib/tenant/acting-cookie";

/**
 * A support screenshot, served through the app.
 *
 * 🔴 NEVER A BUCKET URL. A screenshot of a stuck funnel carries lead names, email
 * addresses and account ids, and a public object URL is guessable forever and cannot be
 * withdrawn once it has been pasted into a chat. The bytes are streamed through here
 * after authorisation, and nothing the client receives says where the file sits.
 *
 * Who may read one: the platform owner, or a login belonging to the tenant that raised
 * the request. A super admin who has entered a workspace is covered by the first of
 * those, so entering is not required to read an attachment on a ticket.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });

  const att = await prisma.supportAttachment.findUnique({
    where: { id },
    select: {
      key: true,
      filename: true,
      contentType: true,
      request: { select: { tenantId: true } },
    },
  });
  if (!att) return new Response("Not found", { status: 404 });

  const me = user as { id: string; email: string; role?: string | null; tenantId?: string | null };
  const owner = isSuperAdmin(me);
  // An operator inside a workspace reads it as that workspace too, which keeps this
  // consistent with every other /w surface.
  const acting = owner ? await readActingTenant(me.id) : null;
  const allowed = owner || me.tenantId === att.request.tenantId || acting === att.request.tenantId;
  // 404 rather than 403: an id that exists and is refused is still an id somebody can
  // confirm exists.
  if (!allowed) return new Response("Not found", { status: 404 });

  const bytes = await storage.download(att.key).catch(() => null);
  if (!bytes) return new Response("Not found", { status: 404 });

  const body = bytes.slice().buffer as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": att.contentType,
      // Inline: the point of a screenshot is to look at it. The filename is quoted and
      // stripped of quotes, because a header cannot carry one safely.
      "Content-Disposition": `inline; filename="${att.filename.replace(/["\\\r\n]/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
