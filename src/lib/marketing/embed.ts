/**
 * Turn a pasted video embed into a URL that is safe to put in an iframe.
 *
 * WHY NOT JUST RENDER THE PASTED HTML
 * The obvious implementation — store the snippet, drop it in with
 * dangerouslySetInnerHTML — is stored XSS on the most public page the product has.
 * Only the platform owner can set it, so the day-to-day risk is low, but it converts
 * a single compromised admin session into script execution for every visitor to the
 * marketing site, forever, with nothing in the UI hinting that it happened.
 *
 * So nothing the author types ever reaches the DOM as markup. We take the snippet
 * apart, keep ONLY the `src` URL, check its host against an allowlist, and render our
 * own iframe around it. A paste that does not yield an allowed URL is refused at save
 * time with a message naming what is allowed — never silently dropped, because a
 * blank hero that the owner believes is set is its own kind of failure.
 *
 * Accepts, in order of how people actually paste things:
 *   - a full <iframe ...> snippet (the "embed code" button on every video host)
 *   - a bare URL, including a normal YouTube watch/share link, which is normalised
 */

/**
 * Hosts whose iframes may be embedded.
 *
 * Two groups: the common video hosts, and the owner's own domains — VidaPulse serves
 * the tracked player used for these videos, and its view tracking is the entire reason
 * for embedding rather than self-hosting a file. Suffix entries match the host itself
 * and any subdomain of it.
 *
 * To add a host, add it here — that is the only place, and the save error quotes this
 * list back to the owner so an unrecognised paste explains itself.
 */
const ALLOWED_HOST_SUFFIXES = [
  "youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
  "vimeo.com",
  "loom.com",
  "wistia.com",
  "wistia.net",
  "vidapulse.com",
  "vidapulse.in",
  "divineleads.guru",
  "applygitawisdom.com",
] as const;

export const ALLOWED_EMBED_HOSTS = ALLOWED_HOST_SUFFIXES.join(", ");

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

export type EmbedParse =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Normalise the share/watch URLs people paste into the URL a player actually embeds.
 * A YouTube watch link in an iframe renders YouTube's "refused to connect" box, which
 * looks like our bug rather than a wrong paste — so fix it instead of rejecting it.
 */
function normalize(u: URL): URL {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  // youtu.be/<id>  ->  youtube.com/embed/<id>
  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\//, "").split("/")[0];
    if (id) return new URL(`https://www.youtube.com/embed/${id}`);
  }
  // youtube.com/watch?v=<id>  ->  youtube.com/embed/<id>
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (v) return new URL(`https://www.${host}/embed/${v}`);
  }
  // vimeo.com/<id>  ->  player.vimeo.com/video/<id>
  if (host === "vimeo.com" && /^\/\d+$/.test(u.pathname)) {
    return new URL(`https://player.vimeo.com/video/${u.pathname.slice(1)}`);
  }
  // loom.com/share/<id>  ->  loom.com/embed/<id>
  if (host === "loom.com" && u.pathname.startsWith("/share/")) {
    return new URL(`https://www.loom.com/embed/${u.pathname.slice("/share/".length)}`);
  }
  return u;
}

/**
 * Parse whatever the owner pasted into a single embeddable URL, or explain why not.
 * Blank input is `ok: false` with an empty error — callers treat blank as "no video"
 * and must not surface it as a validation failure.
 */
export function parseEmbed(input: string | null | undefined): EmbedParse {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "" };

  // Pull the src out of an iframe snippet; otherwise treat the whole thing as a URL.
  // Deliberately the ONLY thing read out of the snippet — width, height, title,
  // allow, style and any on* attribute are discarded rather than passed through.
  const iframeSrc = /<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(raw)?.[1];
  const candidate = iframeSrc ?? raw;

  if (!iframeSrc && /<\/?[a-z]/i.test(raw)) {
    return {
      ok: false,
      error: "That looks like HTML but has no <iframe src=…>. Paste the embed code or the video URL.",
    };
  }

  let url: URL;
  try {
    url = new URL(candidate.startsWith("//") ? `https:${candidate}` : candidate);
  } catch {
    return { ok: false, error: "That is not a valid URL. Paste the embed code or the video link." };
  }

  // http: is rejected as well as javascript:/data: — an insecure frame on an HTTPS page
  // is blocked by the browser anyway, so accepting it would store a video that silently
  // never renders.
  if (url.protocol !== "https:") {
    return { ok: false, error: "The video URL must start with https://." };
  }
  const normalized = normalize(url);
  if (!hostAllowed(normalized.hostname)) {
    return {
      ok: false,
      error: `Videos can only be embedded from: ${ALLOWED_EMBED_HOSTS}. Yours was ${normalized.hostname}.`,
    };
  }
  return { ok: true, url: normalized.toString() };
}

/** The stored shape: one hero video, plus one per capability tile keyed by its title. */
export interface LandingVideos {
  hero: string | null;
  tiles: Record<string, string>;
}

export const EMPTY_LANDING_VIDEOS: LandingVideos = { hero: null, tiles: {} };

/**
 * Read the stored JSON back into a usable shape, dropping anything that no longer
 * parses. Re-validating on READ (not just on save) matters because the allowlist can
 * change: a host removed from it must stop rendering everywhere, not keep working on
 * rows that were saved while it was still allowed.
 */
export function readLandingVideos(value: unknown): LandingVideos {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_LANDING_VIDEOS;
  const v = value as { hero?: unknown; tiles?: unknown };

  const hero = typeof v.hero === "string" ? parseEmbed(v.hero) : null;
  const tiles: Record<string, string> = {};
  if (v.tiles && typeof v.tiles === "object" && !Array.isArray(v.tiles)) {
    for (const [k, raw] of Object.entries(v.tiles as Record<string, unknown>)) {
      if (typeof raw !== "string") continue;
      const p = parseEmbed(raw);
      if (p.ok) tiles[k] = p.url;
    }
  }
  return { hero: hero?.ok ? hero.url : null, tiles };
}
