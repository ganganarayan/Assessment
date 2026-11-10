import type { Metadata } from "next";
import { cookies } from "next/headers";
import { MARKETING } from "@/lib/marketing/content";
import { currentOrigin } from "@/lib/seo/site";
import { THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme";
import { getCurrentTenant } from "@/lib/tenant/context";
import { tenantThemeCss } from "@/lib/tenant/theme-css";
import "./globals.css";

const httpsOnly = (u: string | null | undefined): string | null => (u && /^https:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : null);

/**
 * The DEFAULTS every route inherits, and they have to be host-aware, because this one
 * layout wraps the marketing site, the admin app and every tenant's funnel.
 *
 * It used to hard-code title "Assessment" / "Multi-tenant assessment platform
 * foundation." - scaffolding copy that then became the real, indexable title of every
 * page that does not set its own, tenant funnels included.
 *
 * - Platform host: the marketing title and description, with a template so a page can
 *   pass a bare name ("Privacy Policy") and get the brand appended once.
 * - Tenant host: the TENANT's name, and NO description. An absent description lets the
 *   search engine write one from the page; inheriting ours would describe someone
 *   else's scorecard as lead-qualification software.
 *
 * metadataBase is the request's own origin so that relative URLs in child metadata
 * resolve against the host being served, not against a guess.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [origin, tenant] = await Promise.all([currentOrigin(), getCurrentTenant()]);
  const metadataBase = new URL(origin);

  if (tenant) {
    // White label: the tenant's own tab icon and share image on its host. Absent = the
    // app's icon, which is the platform's; set in Settings, Brand and legal.
    const favicon = httpsOnly(tenant.theme?.faviconUrl);
    const share = httpsOnly(tenant.theme?.shareImageUrl);
    return {
      metadataBase,
      title: { default: tenant.name, template: `%s · ${tenant.name}` },
      ...(favicon ? { icons: { icon: favicon, shortcut: favicon, apple: favicon } } : {}),
      ...(share ? { openGraph: { images: [share], siteName: tenant.name } } : {}),
    };
  }

  return {
    metadataBase,
    title: { default: MARKETING.title, template: `%s · ${MARKETING.name}` },
    description: MARKETING.description,
    // Search Console / Bing ownership, as a meta tag rather than an uploaded HTML file.
    // Both methods are equally valid to Google; the tag has the advantage of surviving
    // deploys with nothing to keep in public/. Absent variable = no tag, which is why
    // this is safe to leave unset. DNS TXT remains the sturdiest option of the three,
    // because it verifies the whole domain and cannot be broken by a routing change.
    verification: {
      ...(process.env.GOOGLE_SITE_VERIFICATION
        ? { google: process.env.GOOGLE_SITE_VERIFICATION }
        : {}),
      ...(process.env.BING_SITE_VERIFICATION
        ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } }
        : {}),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [cookieStore, tenant] = await Promise.all([cookies(), getCurrentTenant()]);
  const theme = cookieStore.get(THEME_COOKIE)?.value;
  // Explicit light/dark can be set server-side; "system" is resolved by the
  // pre-paint init script. suppressHydrationWarning: the script may add `dark`.
  const htmlClass = theme === "dark" ? "dark" : undefined;

  // On a resolved tenant (subdomain / custom domain), apply their brand colors.
  // Null on the platform root, so the marketing home keeps the default palette.
  const themeCss = tenantThemeCss(tenant?.theme?.primaryColor, tenant?.theme?.secondaryColor);

  return (
    <html lang="en" className={htmlClass} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
        {children}
      </body>
    </html>
  );
}
