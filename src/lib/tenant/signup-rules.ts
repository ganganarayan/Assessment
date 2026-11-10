/**
 * Workspace names and signup emails the platform refuses (Phase 2 of the multi-tenant
 * review). Pure, no imports, so the signup hook, the provisioning path and the verify
 * script all read the same lists.
 */

/**
 * Workspace slugs that can never belong to a customer. A tenant slug becomes a
 * subdomain (acme.<root>), so "admin", "api" or "mail" taken by a signup would sit on
 * a hostname people trust as the platform's own: a phishing page with our certificate.
 */
export const RESERVED_TENANT_SLUGS: ReadonlySet<string> = new Set([
  "www", "app", "api", "admin", "administrator", "root", "system", "internal",
  "platform", "assess", "assess360", "divineleads", "orbitq", "staging", "stage", "dev",
  "test", "demo", "sandbox", "preview", "prod", "production",
  "mail", "email", "webmail", "smtp", "imap", "pop", "mx", "ns", "ns1", "ns2", "ftp",
  "cdn", "static", "assets", "media", "files", "img", "images", "uploads", "storage",
  "auth", "login", "signin", "sign-in", "signup", "sign-up", "register", "account",
  "accounts", "oauth", "sso", "secure", "security", "verify",
  "billing", "pay", "payment", "payments", "checkout", "invoice", "invoices",
  "dashboard", "console", "panel", "workspace", "workspaces", "settings",
  "help", "support", "docs", "status", "blog", "news", "legal", "privacy", "terms",
  "about", "contact", "official", "team", "staff", "owner", "superadmin",
]);

export function isReservedTenantSlug(slug: string): boolean {
  return RESERVED_TENANT_SLUGS.has(slug.trim().toLowerCase());
}

/**
 * Throwaway-inbox domains. Email verification is still off (there is no platform mail
 * sender wired to it yet), so without this an endless supply of 14-day trials costs one
 * disposable address each. Not exhaustive and not meant to be: it removes the services a
 * person finds by searching "temporary email", which is where nearly all of it comes from.
 */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "sharklasers.com",
  "grr.la", "10minutemail.com", "10minutemail.net", "temp-mail.org", "tempmail.com", "tempmail.net",
  "tempmailo.com", "temp-mail.io", "tempr.email", "yopmail.com", "yopmail.net", "trashmail.com",
  "trashmail.de", "getnada.com", "nada.email", "maildrop.cc", "dispostable.com", "throwawaymail.com",
  "fakeinbox.com", "mintemail.com", "emailondeck.com", "mohmal.com", "discard.email", "mailnesia.com",
  "mytemp.email", "burnermail.io", "moakt.com", "inboxkitten.com", "mail.tm", "emailfake.com",
  "crazymailing.com", "mailcatch.com", "spamgourmet.com", "getairmail.com", "tempinbox.com",
  "mailpoof.com", "emailtemporanea.net", "minuteinbox.com", "tmail.ws", "tmpmail.org", "tmpmail.net",
  "1secmail.com", "1secmail.org", "1secmail.net", "emltmp.com", "luxusmail.org", "byom.de",
]);

export function isDisposableEmail(email: string): boolean {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.trim().toLowerCase().slice(at + 1);
  // A subdomain of a listed service (x.mailinator.com) is the same service.
  for (const d of DISPOSABLE_EMAIL_DOMAINS) if (domain === d || domain.endsWith(`.${d}`)) return true;
  return false;
}
