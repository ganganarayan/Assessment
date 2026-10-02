import "server-only";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { effectiveHost } from "@/lib/tenant/forwarded-host";
import { MARKETING } from "@/lib/marketing/content";
import { prisma } from "@/lib/db/prisma";

/**
 * Host and canonical helpers for the public surfaces.
 *
 * The one fact that shapes all of this: every public route is served on EVERY host. The
 * app answers /privacy, /terms and /a/<any-slug> on the platform domain, on every tenant
 * subdomain, and on every tenant custom domain, because routing resolves the tenant from
 * the host rather than from the path. Without canonicals that is the same document at
 * three or more addresses - textbook duplicate content, and it gets worse with each
 * custom domain a customer adds.
 *
 * So: a page that belongs to the PLATFORM (marketing, policies) always declares its
 * canonical on the platform domain, whichever host served it. A page that belongs to a
 * TENANT declares its canonical on that tenant's primary domain. Nothing relies on the
 * request host being the "right" one.
 */

export { PLATFORM_HOST, isPlatformHost } from "./urls";

/** Absolute origin of the host this request actually arrived on. */
export async function currentOrigin(): Promise<string> {
  const host = effectiveHost(await headers());
  // No host header at all is not a real browser request; the platform domain is the
  // only safe answer, since a relative metadataBase throws.
  return host ? `https://${host}` : MARKETING.domain;
}

/**
 * The generated share card (app/og-image/route.tsx), as metadata wants it. Absolute on
 * the platform domain: a share card is scraped by someone else's server, which has no
 * notion of the host that produced the tag.
 */
export const OG_IMAGE = {
  url: `${MARKETING.domain}/og-image`,
  width: 1200,
  height: 630,
  alt: `${MARKETING.name} - qualify leads before the sales call`,
} as const;

/** Canonical URL on the platform domain for a path like "/privacy". */
export function platformUrl(path: string): string {
  return MARKETING.domain + (path === "/" ? "/" : path.replace(/\/$/, ""));
}

/**
 * Metadata for a page the PLATFORM owns and that is the same on every host - the
 * policies and the other public static pages.
 *
 * `title` is a bare page name ("Privacy Policy"), not a full tag: the root layout's
 * template appends the brand, so passing "Privacy Policy - Assess360" here would
 * produce it twice. OG gets the composed form, because a share card has no template.
 */
export function platformPageMetadata(input: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = platformUrl(input.path);
  const composed = `${input.title} · ${MARKETING.name}`;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: MARKETING.name,
      title: composed,
      description: input.description,
      url,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: composed,
      description: input.description,
      images: [OG_IMAGE.url],
    },
  };
}

/**
 * The origin a TENANT's public pages should call canonical, or null when there is no
 * stable one to name.
 *
 * Same funnel, several addresses: a tenant's scorecard answers on their custom domain, on
 * their subdomain, AND on the platform domain, because the slug lookup is global rather
 * than host-scoped. Whichever host a crawler arrives on, the canonical has to point at
 * one of them, and the right one is the tenant's own - that is the address their ads
 * send traffic to and the one they would want ranking.
 *
 * `verified` is NOT part of the lookup, matching getCurrentTenant: that flag tracks
 * certificate issuance and is known to go stale, so gating on it would drop the canonical
 * for a domain that is serving traffic perfectly well.
 *
 * A null tenantId means the assessment is the platform's own (the null-tenant
 * convention), so the platform domain is the canonical home.
 */
export async function tenantCanonicalOrigin(tenantId: string | null): Promise<string | null> {
  if (!tenantId) return MARKETING.domain;

  const domain = await prisma.domain.findFirst({
    where: { tenantId },
    // Primary first, then oldest - a stable choice, so the canonical does not move when
    // a tenant adds a second domain.
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { hostname: true },
  });
  if (domain) return `https://${domain.hostname}`;

  // No custom domain: the tenant is still reachable at their subdomain, when the install
  // has a root domain configured.
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim();
  if (!root) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  return tenant ? `https://${tenant.slug}.${root}` : null;
}
