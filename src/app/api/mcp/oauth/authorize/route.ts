import { authenticateMcp } from "@/mcp/core/auth";
import { authorizeQuery, checkAuthorizeParams, issueCode, originOf } from "@/mcp/oauth/core";
import { rateLimit } from "@/lib/rate-limit";

/**
 * The connect form posts here (step 2). The pasted key is checked with the SAME rules as
 * every MCP call (valid, not revoked, an MCP key, paid workspace, release switch). Then the
 * browser goes back to Claude with a one-time code; Claude swaps it for the key at /token.
 */
export const dynamic = "force-dynamic";

function back(origin: string, query: string): Response {
  return new Response(null, { status: 303, headers: { location: `${origin}/mcp/connect?${query}`, "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const origin = originOf(req);
  const form = await req.formData();
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : null;
  };
  const check = checkAuthorizeParams(get);
  if (!check.ok) return back(origin, new URLSearchParams({ error: check.error }).toString());

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`mcp-connect:${ip}`, 10)) {
    return back(origin, authorizeQuery(check.req, { error: "Too many attempts. Wait a minute and try again." }));
  }

  const key = (get("key") ?? "").trim();
  if (!key) return back(origin, authorizeQuery(check.req, { error: "Paste your MCP key." }));
  const auth = await authenticateMcp(new Request(`${origin}/api/mcp`, { headers: { authorization: `Bearer ${key}` } }));
  if (!auth.ok) return back(origin, authorizeQuery(check.req, { error: auth.error }));

  const target = new URL(check.req.redirectUri);
  target.searchParams.set("code", issueCode(key, check.req));
  if (check.req.state) target.searchParams.set("state", check.req.state);
  return new Response(null, { status: 303, headers: { location: target.toString(), "cache-control": "no-store" } });
}
