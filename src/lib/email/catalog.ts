/**
 * The email providers, as DATA.
 *
 * 🔴 A PLAIN MODULE, no "server-only", on purpose: the settings screen is a client
 * component and needs the labels, the transports and the hints to draw its dropdown.
 * The senders live next door in providers.ts, which is server-only because it touches
 * credentials. Splitting them is what lets one list drive both the UI and the wire
 * without shipping a single API call to the browser.
 *
 * providers.ts asserts at module load that every id here has a sender, so adding a row
 * and forgetting the other half fails on boot rather than on somebody's first send.
 */

/** HTTPS works everywhere; SMTP is for hosts that allow outbound mail ports. */
export type EmailTransport = "HTTPS" | "SMTP";

export interface EmailProviderOption {
  id: string;
  label: string;
  transport: EmailTransport;
  /** What the provider's own console calls the credential. Their words, not ours. */
  keyLabel: string;
  /** Where to find it, in one line, so nobody has to go searching. */
  keyHint: string;
}

/** Order is the order of the dropdown: HTTPS first, SMTP last and clearly last. */
export const EMAIL_PROVIDER_OPTIONS: readonly EmailProviderOption[] = [
  {
    id: "ZEPTOMAIL_IN",
    label: "ZeptoMail (India)",
    transport: "HTTPS",
    keyLabel: "Send Mail token",
    keyHint: "ZeptoMail console, Mail Agents, your agent, SMTP and API, Send Mail Token.",
  },
  {
    id: "ZEPTOMAIL_COM",
    label: "ZeptoMail (Global)",
    transport: "HTTPS",
    keyLabel: "Send Mail token",
    keyHint: "ZeptoMail console, Mail Agents, your agent, SMTP and API, Send Mail Token.",
  },
  {
    id: "RESEND",
    label: "Resend",
    transport: "HTTPS",
    keyLabel: "API key",
    keyHint: "resend.com, API Keys. Starts with re_. The From domain must be verified there.",
  },
  {
    id: "BREVO",
    label: "Brevo (Sendinblue)",
    transport: "HTTPS",
    keyLabel: "API key (v3)",
    keyHint: "Brevo, SMTP and API, API keys. Starts with xkeysib-.",
  },
  {
    id: "SENDGRID",
    label: "SendGrid",
    transport: "HTTPS",
    keyLabel: "API key",
    keyHint: "SendGrid, Settings, API Keys, with Mail Send permission. Starts with SG.",
  },
  {
    id: "POSTMARK",
    label: "Postmark",
    transport: "HTTPS",
    keyLabel: "Server API token",
    keyHint: "Postmark, your server, API Tokens. The SERVER token, not the account one.",
  },
  {
    id: "MAILGUN",
    label: "Mailgun (US)",
    transport: "HTTPS",
    keyLabel: "Sending API key",
    keyHint: "Mailgun, Send, Sending API keys. Your From domain must be verified there.",
  },
  {
    id: "MAILGUN_EU",
    label: "Mailgun (EU)",
    transport: "HTTPS",
    keyLabel: "Sending API key",
    keyHint: "Mailgun EU region. Your From domain must be verified in that same region.",
  },
  {
    id: "SMTP2GO",
    label: "SMTP2GO",
    transport: "HTTPS",
    keyLabel: "API key",
    keyHint: "SMTP2GO, Sending, API Keys. Starts with api-.",
  },
  {
    id: "SMTP",
    label: "Custom SMTP server",
    transport: "SMTP",
    keyLabel: "Password",
    keyHint: "Your mail server's own credentials. Blocked on Railway and most PaaS hosts.",
  },
];

/**
 * The id used when nobody has chosen, and the one every pre-existing row backfills to.
 *
 * SMTP rather than a working provider on purpose: a row that predates this screen had
 * SMTP settings and nothing else, so claiming it uses anything else would be a lie that
 * sends a credential to the wrong host.
 */
export const DEFAULT_PROVIDER_ID = "SMTP";

export function emailProviderOption(id: string | null): EmailProviderOption {
  return (
    EMAIL_PROVIDER_OPTIONS.find((p) => p.id === id) ??
    (EMAIL_PROVIDER_OPTIONS.find((p) => p.id === DEFAULT_PROVIDER_ID) as EmailProviderOption)
  );
}
