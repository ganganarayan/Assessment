/**
 * VSL result-page block vocabulary + theme presets. Plain types (safe on client and
 * server). A result page is a THEME plus an ordered list of typed blocks whose
 * `config` is type-specific JSON — new block types never touch the schema. Static
 * blocks the admin fills; the one dynamic block (ai_statement) renders from the
 * respondent's result. Stored whole on Assessment.resultPage (draft) /
 * resultPagePublished (live), so there are no per-block DB rows.
 */

export type ResultBlockType =
  | "eyebrow" // { text }
  | "headline" // { text }
  | "subhead" // { text }
  | "ai_statement" // { fallback? } dynamic: the respondent's generated statement
  | "text" // { text }
  | "button" // { label, url, bg, color, fontSize, align }
  | "video" // { embedCode } a pasted iframe embed (e.g. VidaPulse)
  | "testimonials" // { heading?, items: [{ url, name, role }] } YouTube links
  | "footer"; // { links: [{label,url}], disclaimer, copyright }

export const RESULT_BLOCK_TYPES: { type: ResultBlockType; label: string }[] = [
  { type: "eyebrow", label: "Eyebrow (small label)" },
  { type: "headline", label: "Headline" },
  { type: "subhead", label: "Sub-headline" },
  { type: "ai_statement", label: "AI statement (from the assessment)" },
  { type: "text", label: "Text / paragraph" },
  { type: "button", label: "Button" },
  { type: "video", label: "VSL video (embed code)" },
  { type: "testimonials", label: "Testimonials (YouTube)" },
  { type: "footer", label: "Footer" },
];

export function isResultBlockType(v: string): v is ResultBlockType {
  return RESULT_BLOCK_TYPES.some((b) => b.type === v);
}

// ---- Block configs ---------------------------------------------------------
export type TextAlign = "left" | "center" | "right";

export interface EyebrowConfig {
  text?: string;
}
export interface HeadlineConfig {
  text?: string;
}
export interface SubheadConfig {
  text?: string;
}
export interface AiStatementConfig {
  /** Shown when this respondent has no AI statement (e.g. AI off). Blank => hide. */
  fallback?: string;
}
export interface ResultTextConfig {
  text?: string;
  align?: TextAlign;
}
export interface ButtonConfig {
  label?: string;
  url?: string;
  bg?: string; // background colour (hex); blank => theme CTA
  color?: string; // text colour (hex); blank => theme CTA text
  fontSize?: number; // px
  align?: TextAlign; // block alignment of the button
}
export interface VideoConfig {
  /** The pasted embed snippet (iframe). The renderer extracts the src safely. */
  embedCode?: string;
}
export interface TestimonialItem {
  url?: string; // YouTube link
  name?: string;
  role?: string;
}
export interface TestimonialsConfig {
  heading?: string;
  items?: TestimonialItem[];
}
export interface FooterLink {
  label?: string;
  url?: string;
}
export interface FooterConfig {
  links?: FooterLink[];
  disclaimer?: string;
  copyright?: string;
}

export interface ResultBlock {
  id: string;
  type: ResultBlockType;
  config: Record<string, unknown>;
}

// ---- Theme presets ---------------------------------------------------------
export type ThemeKey = "dark_gold" | "light_orange" | "warm_sand" | "light_green";

export interface ResultTheme {
  bg: string;
  text: string;
  muted: string;
  cta: string;
  ctaText: string;
  card: string;
  border: string;
}

export const RESULT_THEMES: Record<ThemeKey, { label: string; theme: ResultTheme }> = {
  dark_gold: {
    label: "Dark / Gold",
    theme: { bg: "#14120F", text: "#F5F1E6", muted: "#B9B2A0", cta: "#D4AF37", ctaText: "#14120F", card: "#1E1B16", border: "#332E25" },
  },
  light_orange: {
    label: "Light / Orange",
    theme: { bg: "#FFFFFF", text: "#1A1A1A", muted: "#555555", cta: "#E8641E", ctaText: "#FFFFFF", card: "#FAFAFA", border: "#E5E5E5" },
  },
  warm_sand: {
    label: "Warm sand / Saffron",
    theme: { bg: "#F7F5F0", text: "#3A2E22", muted: "#7A6E5E", cta: "#D97706", ctaText: "#FFFFFF", card: "#FFFFFF", border: "#E7E0D4" },
  },
  light_green: {
    label: "Light / Green",
    theme: { bg: "#FFFFFF", text: "#111111", muted: "#555555", cta: "#16A34A", ctaText: "#FFFFFF", card: "#FAFAFA", border: "#E5E5E5" },
  },
};

export const DEFAULT_THEME: ThemeKey = "dark_gold";
export function isThemeKey(v: string): v is ThemeKey {
  return Object.prototype.hasOwnProperty.call(RESULT_THEMES, v);
}
export function themeOf(key: string | null | undefined): ResultTheme {
  return RESULT_THEMES[(key && isThemeKey(key) ? key : DEFAULT_THEME)].theme;
}

/** The whole page: a theme + ordered blocks. */
export interface ResultPageData {
  theme: ThemeKey;
  blocks: ResultBlock[];
}
export const EMPTY_RESULT_PAGE: ResultPageData = { theme: DEFAULT_THEME, blocks: [] };

/** Default config when adding a new block (so the editor has fields to fill). */
export function defaultResultConfig(type: ResultBlockType): Record<string, unknown> {
  switch (type) {
    case "eyebrow":
      return { text: "" };
    case "headline":
      return { text: "" };
    case "subhead":
      return { text: "" };
    case "ai_statement":
      return { fallback: "" };
    case "text":
      return { text: "", align: "center" };
    case "button":
      return { label: "Book a call", url: "", bg: "", color: "", fontSize: 18, align: "center" };
    case "video":
      return { embedCode: "" };
    case "testimonials":
      return { heading: "", items: [{ url: "", name: "", role: "" }, { url: "", name: "", role: "" }, { url: "", name: "", role: "" }] };
    case "footer":
      return {
        links: [
          { label: "Contact us", url: "" },
          { label: "Terms of use", url: "" },
          { label: "Privacy policy", url: "" },
          { label: "Refund policy", url: "" },
        ],
        disclaimer: "",
        copyright: "",
      };
    default:
      return {};
  }
}

/** Coerce a stored resultPage JSON value into typed data (defensive; never throws). */
export function readResultPage(value: unknown): ResultPageData {
  if (!value || typeof value !== "object") return { ...EMPTY_RESULT_PAGE };
  const v = value as { theme?: unknown; blocks?: unknown };
  const theme = typeof v.theme === "string" && isThemeKey(v.theme) ? v.theme : DEFAULT_THEME;
  const blocks = Array.isArray(v.blocks)
    ? v.blocks
        .map((b) => {
          const bb = b as { id?: unknown; type?: unknown; config?: unknown };
          const type = typeof bb.type === "string" && isResultBlockType(bb.type) ? bb.type : null;
          if (!type) return null;
          return {
            id: String(bb.id ?? ""),
            type,
            config: (bb.config && typeof bb.config === "object" ? bb.config : {}) as Record<string, unknown>,
          };
        })
        .filter((b): b is ResultBlock => b !== null)
    : [];
  return { theme, blocks };
}

// ---- Embed helpers ---------------------------------------------------------

/** Pull the first http(s) URL out of a pasted iframe embed's src attribute. Returns
 *  null when there is no iframe/src — so the renderer shows nothing rather than
 *  injecting arbitrary HTML. This is what makes a pasted embed safe to render: we
 *  only ever emit a controlled <iframe src=…>, never the raw pasted markup. */
export function extractEmbedSrc(code: string | null | undefined): string | null {
  if (!code) return null;
  const m = code.match(/src\s*=\s*["']([^"']+)["']/i);
  const raw = m?.[1]?.trim();
  if (!raw) return null;
  const url = raw.startsWith("//") ? `https:${raw}` : raw;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

/** A YouTube watch/share/embed link → its video id (11 chars), else null. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Privacy-enhanced YouTube embed URL for a testimonial link (null if not YouTube). */
export function youtubeEmbedUrl(url: string | null | undefined): string | null {
  const id = youtubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

/** Use a link EXACTLY as the admin typed it — never append or rewrite. The only
 *  adjustment is prefixing https:// to a bare host (e.g. "site.com/x"), otherwise the
 *  browser would treat it as relative and stick it onto the current page's path. Real
 *  schemes (http, https, mailto, tel), anchors and root-relative paths pass untouched.
 *  Returns null for a blank link (so the caller can render a non-clickable button). */
export function normalizeHref(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(u)) return u;
  return `https://${u}`;
}
