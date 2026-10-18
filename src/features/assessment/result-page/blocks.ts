/**
 * VSL result-page block vocabulary + theme presets. Plain types (safe on client and
 * server). A result page is a THEME plus an ordered list of typed blocks whose
 * `config` is type-specific JSON - new block types never touch the schema. Static
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
  /**
   * Treat a click as a BOOKING REQUEST: route it through /api/cta/... so the click is
   * recorded, the CRM webhook fires and the owner is emailed, before forwarding to the
   * same destination. Off by default, so every existing button keeps linking straight
   * out exactly as before. The destination and its VidaPulse ids are unchanged either
   * way - only the path taken to get there differs.
   */
  bookingCta?: boolean;
  /**
   * Where to email the "someone asked for a call" notification, via the tenant's own
   * SMTP. Blank = no notification (the webhook and the recorded click still happen).
   * A field rather than a constant: every tenant has its own inbox.
   */
  notifyEmail?: string;
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

/**
 * Who a block is written for.
 *
 * The waitlist route gets the same diagnosis and the same VSL, and must not get the
 * same close: a button saying APPLY FOR YOUR SEAT, shown to somebody who has just said
 * they cannot make those dates, reads as a taunt, and a scarcity line they cannot act
 * on is pressure with nowhere to go.
 *
 * So a block can be addressed. ALL is the default and is what every block ever saved
 * already is, which is why adding this changes nothing until somebody sets it.
 */
export type BlockAudience =
  | "ALL" // everyone (default)
  | "MAIN" // only the people who came through the funnel proper
  | "EXIT"; // only people routed in through an exit (optionally one named exit)

export interface ResultBlock {
  id: string;
  type: ResultBlockType;
  config: Record<string, unknown>;
  /** Who sees it. Absent = ALL, so nothing that exists today is affected. */
  showFor?: BlockAudience;
  /** With showFor EXIT: restrict to ONE route by key. Blank = any exit route. */
  exitKey?: string;
}

/**
 * Whether a block renders for a given viewer, where `exitKey` is the route they came
 * in through (null = the funnel proper).
 *
 * Unknown values render: a block whose audience cannot be read is a block the owner
 * wrote and expects to see, and silently dropping it is the worse failure.
 */
export function blockVisibleFor(block: ResultBlock, exitKey: string | null): boolean {
  const showFor = block.showFor ?? "ALL";
  if (showFor === "MAIN") return !exitKey;
  if (showFor === "EXIT") {
    if (!exitKey) return false;
    const only = (block.exitKey ?? "").trim();
    return !only || only === exitKey;
  }
  return true;
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
 *  null when there is no iframe/src - so the renderer shows nothing rather than
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

/** Use a link EXACTLY as the admin typed it - never append or rewrite. The only
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

// ---- Any video, not only an embed ------------------------------------------

export type VideoSourceKind = "iframe" | "file" | "hls";

export interface VideoSource {
  kind: VideoSourceKind;
  src: string;
}

/**
 * WHAT WAS PASTED, AND HOW IT HAS TO BE PLAYED.
 *
 * The video block used to accept one thing: an iframe embed, in practice VidaPulse's.
 * That is a host decision baked into the product - somebody with an mp4 in R2, a
 * YouTube link or an HLS stream from their own encoder had nowhere to put it. So the
 * field now takes a URL or an embed code, and this decides what the renderer does with
 * it:
 *
 *   iframe  an embed snippet, or a URL from a player that expects to be framed
 *           (YouTube and Vimeo are rewritten to their embed form)
 *   file    a progressive file the browser plays itself: mp4, webm, ogg, mov, m4v
 *   hls     an .m3u8 playlist, which needs hls.js everywhere except Safari
 *
 * 🔴 NEVER THE RAW PASTED MARKUP. An embed is reduced to its src and re-emitted as a
 * controlled iframe, exactly as before, which is what makes pasting one safe. Anything
 * that is not an http(s) URL after that is nothing at all.
 *
 * The fallback for an unrecognised URL is `iframe`, because that is what this block did
 * for its whole life and a tenant whose player is not in the list above is relying on it.
 */
export function resolveVideoSource(input: string | null | undefined): VideoSource | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // An embed snippet: take its src and nothing else.
  if (/<\s*iframe/i.test(raw)) {
    const src = extractEmbedSrc(raw);
    return src ? { kind: "iframe", src } : null;
  }

  const url = raw.startsWith("//") ? `https:${raw}` : raw;
  if (!/^https?:\/\//i.test(url)) return null;

  const yt = youtubeEmbedUrl(url);
  if (yt) return { kind: "iframe", src: yt };

  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})/i)?.[1];
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo}` };

  // The path decides, not the query: a signed URL carries a token after the ? and the
  // extension is still what the browser has to play.
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  if (path.endsWith(".m3u8")) return { kind: "hls", src: url };
  if (/\.(mp4|webm|ogg|ogv|mov|m4v)$/.test(path)) return { kind: "file", src: url };

  return { kind: "iframe", src: url };
}
