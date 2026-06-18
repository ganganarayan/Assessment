import "server-only";
import { headers, cookies } from "next/headers";

/**
 * Pull the visitor's match signals from the current request for Meta CAPI:
 * client IP, user agent, and the Meta browser cookies (_fbp / _fbc). These
 * raise the server event's match quality. Server-only (uses next/headers).
 */
export interface MetaRequestContext {
  clientIpAddress: string | null;
  clientUserAgent: string | null;
  fbp: string | null;
  fbc: string | null;
}

const EMPTY: MetaRequestContext = {
  clientIpAddress: null,
  clientUserAgent: null,
  fbp: null,
  fbc: null,
};

export async function getMetaRequestContext(): Promise<MetaRequestContext> {
  // Fail-soft: this only enriches match quality. If the dynamic APIs ever throw
  // (e.g. called outside a request scope), return empty signals — never let it
  // surface into the submission flow.
  try {
    const h = await headers();
    const c = await cookies();

    // x-forwarded-for is a comma-separated list (client first) behind a proxy.
    const xff = h.get("x-forwarded-for");
    const ip = xff ? (xff.split(",")[0]?.trim() ?? null) : (h.get("x-real-ip") ?? null);

    return {
      clientIpAddress: ip && ip.length > 0 ? ip : null,
      clientUserAgent: h.get("user-agent"),
      fbp: c.get("_fbp")?.value ?? null,
      fbc: c.get("_fbc")?.value ?? null,
    };
  } catch {
    return EMPTY;
  }
}
