/**
 * Turning what an owner typed into the HTML an email client will render. PURE: no DB,
 * no env, no server-only, so scripts/verify-automations.ts can prove it without a
 * database.
 *
 * 🔴 WHY THIS EXISTS. The body field used to say "HTML allowed", which in practice
 * meant HTML REQUIRED: a body typed as ordinary prose arrived as one unbroken
 * paragraph, because every newline a person types is whitespace to an email client.
 * Nobody outside this trade is going to write <p> tags into a reminder, so the ones
 * who tried wrote plain text and shipped a message that looked broken.
 *
 * The conversion is deliberately detected rather than stored as a flag on the row.
 * A flag needs a migration, needs a default for every body written before it existed,
 * and needs the owner to get it right; detection needs none of that and is correct in
 * both directions, because a body that already carries tags is left exactly alone.
 */

/** Tags we treat as proof the author is writing HTML on purpose. */
const HTML_TAG = /<(?:p|br|div|a|strong|b|em|i|ul|ol|li|h[1-6]|table|tr|td|span|img|blockquote)\b[^>]*>/i;

/**
 * Is this body already HTML?
 *
 * Deliberately narrow. "a < b" is not HTML, an angle bracket in a sentence is not
 * HTML, and an email that merely mentions <script> is not HTML either - only the tags
 * somebody writing a message would actually reach for count.
 */
export function looksLikeHtml(body: string): boolean {
  return HTML_TAG.test(body);
}

/** The five characters that would otherwise close a tag we did not open. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// http(s) up to the first whitespace, with trailing sentence punctuation left outside
// the link: "see https://x.example/a." should not produce a link ending in a full stop.
const URL_RE = /\bhttps?:\/\/[^\s<]+/g;
const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/;

/**
 * Bare URLs become links.
 *
 * Runs on ESCAPED text, so the href is built from characters that are already safe to
 * sit inside an attribute. The visible text keeps the ampersands the escape produced,
 * which is what an email client wants to see.
 */
function linkify(escaped: string): string {
  return escaped.replace(URL_RE, (match) => {
    const trail = TRAILING_PUNCT.exec(match);
    const url = trail ? match.slice(0, match.length - trail[0].length) : match;
    const tail = trail ? trail[0] : "";
    if (!url) return match;
    return `<a href="${url}">${url}</a>${tail}`;
  });
}

/**
 * Plain text to HTML: blank line starts a paragraph, single newline is a line break.
 *
 * 🔴 ESCAPE FIRST, ALWAYS. This runs AFTER placeholders have been filled, so the text
 * arriving here contains a real person's name, profession and answers. Somebody called
 * "Smith & Sons <sales>" would otherwise close a tag nobody opened and take the rest
 * of the message with them.
 */
export function textToHtml(text: string): string {
  const normalised = text.replace(/\r\n/g, "\n").trim();
  if (!normalised) return "";
  return normalised
    .split(/\n{2,}/)
    .map((para) => `<p>${linkify(escapeHtml(para)).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

/**
 * The body as it should be sent: untouched when the author wrote HTML, converted when
 * they wrote prose.
 *
 * 🟡 CALL THIS AFTER FILLING PLACEHOLDERS, never before. {{meetingLink}} is a bare URL
 * once it is filled, and linkify is what makes it clickable; converting first would
 * leave the placeholder as literal text and the URL as no link at all.
 */
export function renderEmailBody(filledBody: string): string {
  return looksLikeHtml(filledBody) ? filledBody : textToHtml(filledBody);
}
