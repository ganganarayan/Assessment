import { headers } from "next/headers";
import { effectiveHost } from "@/lib/tenant/forwarded-host";
import { isPlatformHost } from "@/lib/seo/urls";

/**
 * Google Search Console ownership token for the platform site.
 *
 * A route rather than a file in public/, for one reason: public/ is served on EVERY host
 * this app answers on, including customers' custom domains. A Google verification token
 * sitting at the root of a customer's domain is an ownership claim over THEIR property,
 * which is not ours to make and would quietly let this account add their domain to its
 * Search Console. Host-gated, exactly like robots.txt and the sitemap, it is an ownership
 * claim about the one host that is actually ours.
 *
 * The body is the single line Google generated, byte for byte: it checks the content, not
 * just the status code, so this must never be "improved" into prettier HTML.
 *
 * 🟡 This verifies the URL-prefix property https://assess360.divineleads.guru/ only. A
 * DOMAIN property (DNS TXT on divineleads.guru) covers every subdomain and both schemes
 * at once; the two can coexist, and the DNS one is worth adding when there is a second
 * host worth watching.
 */
const TOKEN = "google-site-verification: google348efcdf34bc741b.html";

export async function GET(): Promise<Response> {
  if (!isPlatformHost(effectiveHost(await headers()))) {
    return new Response("", { status: 404 });
  }
  return new Response(TOKEN, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Ownership can be re-checked at any time and the answer never changes, but a long
      // cache on a verification token is how a revoked one stays "valid" for a day.
      "cache-control": "public, max-age=300",
    },
  });
}
