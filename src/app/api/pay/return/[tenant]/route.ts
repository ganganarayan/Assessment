import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import {
  HANDOFF_COOKIE,
  claimByNonce,
  claimByEmail,
  noteReference,
} from "@/lib/payments/handoff";

/**
 * GET/POST /api/pay/return/<tenant-slug>
 *
 * The success URL a tenant pastes into their own payment gateway. One string, the
 * same for every respondent, because that is all a payment link can be configured
 * with. Who came back is resolved here instead:
 *
 *   1. The hand-off cookie (httpOnly, SameSite=Lax) set when we sent them to pay.
 *   2. Failing that, the email they used - asked for on a small form. Routine, not
 *      exceptional: the Instagram and Facebook in-app browsers regularly open a
 *      payment page in the system browser, so the cookie never existed there.
 *   3. If the gateway appends its own reference and the assessment names that
 *      parameter, it is recorded for reconciliation. Never treated as proof.
 *
 * 🔴 Returning here proves a browser came back from a gateway. It does not prove a
 * payment succeeded, and nothing here can see a refund. A tenant who needs proof
 * configures their own Razorpay keys and the real webhook.
 */

export const dynamic = "force-dynamic";

/** Shell for the two screens this endpoint can render. Deliberately self-contained:
 *  a respondent arrives here from an external gateway, mid-payment, and the one thing
 *  that must not happen is a crash or a redirect loop. */
function page(title: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0b1220; color:#e8edf7; font:16px/1.55 system-ui,Segoe UI,Arial,sans-serif; padding:16px; }
  .card { width:100%; max-width:420px; }
  h1 { font-size:22px; margin:0 0 8px; }
  p { color:#9fb0c9; margin:0 0 16px; }
  label { display:block; font-size:14px; margin:0 0 6px; }
  input { width:100%; box-sizing:border-box; padding:12px; border-radius:8px;
          border:1px solid #2a3850; background:#0f1829; color:#e8edf7; font-size:16px; }
  button { width:100%; margin-top:12px; padding:12px; border:0; border-radius:8px;
           background:#16a34a; color:#fff; font-size:16px; font-weight:600; cursor:pointer; }
</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

function askForEmail(slug: string, message?: string): NextResponse {
  return page(
    "One more step",
    `<h1>One more step</h1>
     <p>${message ?? "Enter the email address you used, and we will take you to your results."}</p>
     <form method="post" action="/api/pay/return/${encodeURIComponent(slug)}">
       <label for="email">Email address</label>
       <input id="email" name="email" type="email" inputmode="email" autocomplete="email" required>
       <button type="submit">Show my results</button>
     </form>`,
  );
}

/** Where a claimed submission sends the respondent. The result page itself validates
 *  the token, so this only has to build the link. */
async function destinationFor(submissionId: string): Promise<string | null> {
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      resultToken: true,
      assessment: { select: { slug: true, paymentReturnParam: true } },
    },
  });
  if (!s?.assessment) return null;
  const t = s.resultToken;
  return `/a/${s.assessment.slug}/r/${submissionId}${t ? `?t=${encodeURIComponent(t)}&r=${encodeURIComponent(t)}` : ""}`;
}

async function tenantIdFor(slug: string): Promise<string | null> {
  const t = await prisma.tenant.findFirst({
    where: { slug, deletedAt: null },
    select: { id: true },
  });
  return t?.id ?? null;
}

/** Record the gateway's own reference when the assessment names the parameter. */
async function captureReference(submissionId: string, url: URL): Promise<void> {
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { assessment: { select: { paymentReturnParam: true } } },
  });
  const param = s?.assessment?.paymentReturnParam?.trim();
  if (!param) return;
  const value = url.searchParams.get(param);
  if (value) await noteReference(submissionId, value);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
): Promise<NextResponse> {
  const { tenant: slug } = await params;
  const tenantId = await tenantIdFor(slug);
  // An unknown slug is a misconfigured gateway, not an attack. Say so plainly rather
  // than 404ing a person who has just paid.
  if (!tenantId) {
    return page(
      "Link not recognised",
      `<h1>This link is not set up yet</h1><p>Please contact the business you paid.</p>`,
      404,
    );
  }

  const jar = await cookies();
  const nonce = jar.get(HANDOFF_COOKIE)?.value ?? "";
  const submissionId = nonce ? await claimByNonce(tenantId, nonce) : null;
  if (!submissionId) return askForEmail(slug);

  await captureReference(submissionId, new URL(req.url));
  const dest = await destinationFor(submissionId);
  if (!dest) return askForEmail(slug, "We could not find that result. Enter the email you used.");

  const res = NextResponse.redirect(new URL(dest, req.url));
  // The ticket is spent; clearing the cookie stops a back-button return from landing
  // on the email form with a nonce that can no longer be claimed.
  res.cookies.delete(HANDOFF_COOKIE);
  return res;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
): Promise<NextResponse> {
  const { tenant: slug } = await params;
  const tenantId = await tenantIdFor(slug);
  if (!tenantId) {
    return page(
      "Link not recognised",
      `<h1>This link is not set up yet</h1><p>Please contact the business you paid.</p>`,
      404,
    );
  }

  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim();
  if (!email) return askForEmail(slug, "Please enter the email address you used.");

  const submissionId = await claimByEmail(tenantId, email);
  // Deliberately the same wording whether the email is unknown or simply has no
  // pending hand-off: this form is reachable by anyone with the link, so it must not
  // become a way to ask whether an address bought something.
  if (!submissionId) {
    return askForEmail(
      slug,
      "We could not match that email to a payment from the last couple of hours. Check the address and try again.",
    );
  }

  const dest = await destinationFor(submissionId);
  if (!dest) return askForEmail(slug, "We could not find that result. Please contact support.");
  return NextResponse.redirect(new URL(dest, req.url), { status: 303 });
}
