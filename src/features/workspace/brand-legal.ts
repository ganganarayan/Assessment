// Plain module (no "use server"): the shapes and limits shared by the Brand and legal
// action and its form. A "use server" file may only export async functions.

/** What a tenant's RESPONDENTS see as theirs: images, legal links, reply-to, PDF line. */
export interface BrandLegal {
  logoUrl: string;
  faviconUrl: string;
  shareImageUrl: string;
  privacyUrl: string;
  termsUrl: string;
  replyToEmail: string;
  reportDisclaimer: string;
  /** The platform's own scope: no image overrides (the app's icon is the platform's). */
  isPlatform: boolean;
}

export type BrandImageKind = "logo" | "favicon" | "share";

/** react-pdf draws PNG and JPEG only, so a logo in another format shows on pages but not in the PDF. */
export const BRAND_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"] as const;
export const BRAND_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
