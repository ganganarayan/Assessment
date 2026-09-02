import type { Metadata } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme";
import { getCurrentTenant } from "@/lib/tenant/context";
import "./globals.css";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** Only emit CSS for values that are strictly hex — never inject stored text as-is. */
function tenantThemeCss(primary?: string | null, secondary?: string | null): string | null {
  const p = primary && HEX.test(primary) ? primary : null;
  const s = secondary && HEX.test(secondary) ? secondary : null;
  if (!p && !s) return null;
  const vars = `${p ? `--primary:${p};` : ""}${s ? `--secondary:${s};` : ""}`;
  // Apply in both light and dark so the brand accent wins in either mode.
  return `:root{${vars}}.dark{${p ? `--primary:${p};` : ""}}`;
}

export const metadata: Metadata = {
  title: "Assessment",
  description: "Multi-tenant assessment platform foundation.",
};

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
