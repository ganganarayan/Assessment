/**
 * The call-to-action link: repair, then resolve.
 *
 * This field is the single destination of every button on every public page, which
 * makes a typo in it the most expensive typo on the site - and a silent one. A link
 * with "htps://" or a missing colon still SAVES, still renders, and still looks like a
 * working button; the funnel simply stops receiving anybody, and the only symptom is
 * traffic that arrives and never converts.
 *
 * So two things happen before a save is accepted:
 *
 *   1. repairCtaHref()  - fixes the handful of mistakes a pasted URL actually has
 *      (a missing "s", colon or slash, a bare domain, a missing leading slash) and
 *      says what it changed, so the owner can see the correction rather than wonder
 *      what was stored.
 *   2. the caller FETCHES it (see absoluteCtaUrl below). A link that cannot be
 *      repaired into something that loads is refused, because a 404 behind a button
 *      is indistinguishable from a working funnel until somebody checks the numbers.
 *
 * Pure, with no next/* or prisma imports: the server action calls it, and
 * scripts/verify-cta-link.ts exercises every case above without a database.
 */

export interface RepairedHref {
  /** The repaired value, or the input trimmed when nothing could be done with it. */
  value: string;
  /** True when `value` differs from the raw input. */
  changed: boolean;
  /** What was fixed, in words the owner reads back. Empty when nothing changed. */
  notes: string[];
  /** False when the result still cannot be understood as a path or a URL. */
  valid: boolean;
}

/** A scheme the owner MEANT as https: "http", "htps", "htp", "httpss", "https". */
const FUZZY_SCHEME = /^h?t{1,3}p{1,2}s{0,2}$/i;

/** Looks like a hostname rather than the first segment of a path. */
const HOSTISH = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

export function repairCtaHref(raw: string): RepairedHref {
  const notes: string[] = [];
  const original = raw ?? "";
  let s = original.trim();

  if (!s) return { value: "", changed: false, notes: [], valid: true };

  // Paste artefacts: wrapping quotes or angle brackets, and the smart quotes a
  // document editor substitutes.
  const unwrapped = s.replace(/^[<"'“‘]+/, "").replace(/[>"'”’]+$/, "");
  if (unwrapped !== s) {
    notes.push("removed the quotes around it");
    s = unwrapped;
  }

  // A URL cannot contain a space, so one is always an artefact of the paste.
  if (/\s/.test(s)) {
    s = s.replace(/\s+/g, "");
    notes.push("removed the spaces");
  }

  // A sentence's full stop or comma, caught by the selection.
  const detrailed = s.replace(/[.,;:]+$/, "");
  if (detrailed !== s && detrailed !== "") {
    notes.push("removed the punctuation at the end");
    s = detrailed;
  }

  // ---- scheme repair -------------------------------------------------------
  // Split a leading scheme-ish token off whatever follows it, however mangled the
  // separator is: "https//x", "https:/x", "https:x", "htps:///x", "http://x".
  const schemeMatch = /^([A-Za-z][A-Za-z0-9+.\-]*)\s*(:|;)?\s*(\/*)(.*)$/.exec(s);
  if (schemeMatch) {
    // Destructured with defaults: under noUncheckedIndexedAccess a capture group is
    // string | undefined, and the optional groups here are genuinely absent for an
    // input like "assess360.example/a/x".
    const token = schemeMatch[1] ?? "";
    const colon = schemeMatch[2] ?? "";
    const slashes = schemeMatch[3] ?? "";
    const rest = schemeMatch[4] ?? "";
    const isScheme =
      // Only treat the token as a scheme when a separator says so, or when the token
      // is a recognisable https typo followed by slashes. Otherwise "answers/x" would
      // be read as the scheme "answers".
      colon !== "" || slashes.length > 0;
    if (isScheme && FUZZY_SCHEME.test(token) && rest) {
      const lower = token.toLowerCase();
      if (lower !== "https" || colon !== ":" || slashes !== "//") {
        if (lower === "http") notes.push("switched http to https");
        else if (lower !== "https") notes.push(`corrected "${token}" to https`);
        if (colon !== ":") notes.push('added the missing ":"');
        if (slashes !== "//") notes.push(slashes.length < 2 ? 'added the missing "//"' : 'trimmed the extra "/"');
      }
      s = `https://${rest}`;
    } else if (isScheme && !FUZZY_SCHEME.test(token) && colon === ":") {
      // A colon before any slash is a SCHEME, and the only one accepted is https.
      // The slash count is not part of this decision: "javascript:alert(1)" has none,
      // and reading it as a path produced "/javascript:alert(1)" - a dead link stored
      // without complaint, which is exactly the silent failure this module exists to
      // prevent. Refuse it instead and let the owner see why.
      //
      // One exception: a host with a port ("staging.example.com:8443/a/x") also has a
      // colon before its first slash, and that is an address, not a scheme.
      const isHostPort = HOSTISH.test(token) && /^\d/.test(rest);
      if (!isHostPort) {
        return { value: s, changed: s !== original.trim(), notes, valid: false };
      }
      // Give it the scheme here. Left to the path branch below it would become
      // "/staging.example.com:8443/a/x", because a host carrying a port does not
      // match HOSTISH.
      s = `https://${s}`;
      notes.push("added https:// in front");
    }
  }

  const hasScheme = /^https:\/\//i.test(s);

  if (!hasScheme) {
    // Protocol-relative ("//assess360.example/a/x").
    if (s.startsWith("//")) {
      const rest = s.replace(/^\/+/, "");
      if (HOSTISH.test(rest.split(/[/?#]/)[0] ?? "")) {
        s = `https://${rest}`;
        notes.push("added https:// in front");
      }
    }

    if (!/^https:\/\//i.test(s)) {
      const firstSegment = s.replace(/^\/+/, "").split(/[/?#]/)[0] ?? "";
      if (HOSTISH.test(firstSegment)) {
        // A bare domain: "assess360.divineleads.guru/a/x".
        s = `https://${s.replace(/^\/+/, "")}`;
        notes.push("added https:// in front");
      } else {
        // A path on this site. One leading slash, and no doubled slashes inside it -
        // "/a//x" is a different URL from "/a/x" and only one of them exists.
        const [pathPart, ...tail] = s.split(/(?=[?#])/);
        let p = (pathPart ?? "").replace(/\/{2,}/g, "/");
        if (!p.startsWith("/")) {
          p = `/${p}`;
          notes.push('added the leading "/"');
        } else if (/\/{2,}/.test(pathPart ?? "")) {
          notes.push("removed the repeated slashes");
        }
        s = p + tail.join("");
      }
    }
  }

  // ---- final shape check ---------------------------------------------------
  let valid: boolean;
  if (s.startsWith("/")) {
    valid = true;
  } else {
    try {
      const u = new URL(s);
      valid = u.protocol === "https:" && !!u.hostname && u.hostname.includes(".");
      s = u.toString();
    } catch {
      valid = false;
    }
  }

  const trimmedOriginal = original.trim();
  return { value: s, changed: s !== trimmedOriginal, notes, valid };
}

/**
 * The URL to actually fetch when checking the link.
 *
 * A path is resolved against the site's own origin, because that is where the button
 * will send people from. Returns null for anything that is not a usable https URL.
 */
export function absoluteCtaUrl(href: string, origin: string): string | null {
  try {
    const u = href.startsWith("/") ? new URL(href, origin) : new URL(href);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** The owner-facing sentence for a repair, or null when nothing was changed. */
export function repairSentence(notes: string[]): string | null {
  if (notes.length === 0) return null;
  if (notes.length === 1) return `Fixed the link: ${notes[0]}.`;
  const last = notes[notes.length - 1];
  return `Fixed the link: ${notes.slice(0, -1).join(", ")} and ${last}.`;
}
