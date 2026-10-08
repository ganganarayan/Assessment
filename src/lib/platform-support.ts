/**
 * How a TENANT reaches the platform's own support.
 *
 * Distinct from `AppSetting.supportEmail`, which is a tenant's support address shown to
 * their RESPONDENTS. This is the other direction: Assess360's own contact, shown inside
 * the workspace to the customer using it. Putting the two in one field would have meant
 * a tenant's respondents being pointed at us, or our customers being pointed at
 * themselves.
 *
 * 🟡 Constants, not settings, and knowingly: changing them needs a deploy. They are the
 * platform's own details rather than anything per-tenant, so there is no tenant row they
 * could live on, and the singleton's supportEmail is already taken by the meaning above.
 * If the WhatsApp number starts changing, this becomes two fields on the platform
 * Settings screen - a small change, and the right one at that point.
 *
 * NOT read from env. Env is for launching the app; a support address that differs
 * between environments is how a staging banner ends up telling a real customer to write
 * to an address nobody reads.
 */
export const PLATFORM_SUPPORT_EMAIL = "connect@divineleads.guru";

/** Display form, as somebody would dial it. */
export const PLATFORM_SUPPORT_WHATSAPP = "9356819176";

/** wa.me needs the country code and no punctuation. India, so 91. */
export const PLATFORM_SUPPORT_WHATSAPP_LINK = "https://wa.me/919356819176";

/** The one sentence that appears in the welcome panel, the support strip and the
 *  paused panel, so the three can never drift into three different offers. */
export const PLATFORM_SETUP_OFFER =
  "Support will get your lead-qualifying engine up in a 30-minute call.";
