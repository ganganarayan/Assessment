import type { Metadata } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assessment Engine SaaS",
  description: "Multi-tenant assessment platform foundation.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  // Explicit light/dark can be set server-side; "system" is resolved by the
  // pre-paint init script. suppressHydrationWarning: the script may add `dark`.
  const htmlClass = theme === "dark" ? "dark" : undefined;

  return (
    <html lang="en" className={htmlClass} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
