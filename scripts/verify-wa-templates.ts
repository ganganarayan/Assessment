/**
 * Unit checks for the WhatsApp template rules and the plain-text email conversion
 * (pure, no DB). Run with:
 *   npm run verify:wa-templates
 *
 * Both halves exist for the same reason: they are decided by rules rather than by
 * looking, and both fail LATE and QUIETLY. A template that breaks one of Meta's rules
 * is not refused at the click; it is queued, reviewed hours later and rejected with a
 * sentence that does not name the rule. An email body converted wrongly is not an
 * error either; it is a message that arrives as one unbroken paragraph, or worse, with
 * somebody's name closing a tag nobody opened.
 *
 * Exits non-zero on the first failure, like the other verify-* scripts.
 */
import {
  NAME_RE,
  normaliseName,
  previewWith,
  templateIssues,
  variableCount,
  variableNumbers,
  type TemplateDraft,
} from "../src/features/wa-templates/types";
import { looksLikeHtml, renderEmailBody, textToHtml, escapeHtml } from "../src/lib/automation/body";

export {};

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}`);
  }
}

const base: TemplateDraft = {
  name: "booking_confirmation",
  language: "en",
  category: "UTILITY",
  headerText: "",
  bodyText: "Hi {{1}}, your call is booked for {{2}}. See you then.",
  footerText: "",
  sampleValues: ["Ravi", "Tuesday at 3 pm"],
};

/* ------------------------------------------------------------ the names --- */

console.log("\nTemplate names");
check("a good name passes", NAME_RE.test("booking_confirmation"));
check("capitals are refused", !NAME_RE.test("Booking_Confirmation"));
check("spaces are refused", !NAME_RE.test("booking confirmation"));
check("hyphens are refused", !NAME_RE.test("booking-confirmation"));
check("normalise makes a legal name", NAME_RE.test(normaliseName("Booking Confirmation!")));
check("normalise collapses runs", normaliseName("a   b") === "a_b");
check("normalise trims the edges", normaliseName("  hi  ") === "hi");

/* -------------------------------------------------------- the variables --- */

console.log("\nVariables");
check("two variables are counted once each", variableCount(base.bodyText) === 2);
check("a repeat is one variable", variableCount("{{1}} and again {{1}} here") === 1);
check("the numbers come back in order", variableNumbers("x {{2}} y {{1}}").join(",") === "2,1");
check("loose spacing still counts", variableCount("hi {{ 1 }} there") === 1);

/* ------------------------------------------------- what Meta would refuse --- */

console.log("\nMeta's rules, checked before Meta sees it");
check("a sound template has no issues", templateIssues(base).length === 0);
check("an empty body is caught", templateIssues({ ...base, bodyText: "" }).length > 0);
check(
  "a gap in the numbering is caught",
  templateIssues({ ...base, bodyText: "Hi {{1}}, see {{3}} now.", sampleValues: ["a", "b", "c"] }).some((i) =>
    i.includes("no gaps"),
  ),
);
check(
  "starting with a variable is caught",
  templateIssues({ ...base, bodyText: "{{1}} your call is booked." }).some((i) => i.includes("cannot start")),
);
check(
  "ending with a variable is caught",
  templateIssues({ ...base, bodyText: "Your call is at {{1}}" }).some((i) => i.includes("cannot end")),
);
check(
  "two adjacent variables are caught",
  templateIssues({ ...base, bodyText: "Hi {{1}}{{2}} welcome aboard." }).some((i) => i.includes("next to each other")),
);
check(
  "a missing example is caught",
  templateIssues({ ...base, sampleValues: ["Ravi"] }).some((i) => i.includes("example")),
);
check(
  "a blank example is caught",
  templateIssues({ ...base, sampleValues: ["Ravi", "   "] }).some((i) => i.includes("example")),
);
check(
  "a body over the limit is caught",
  templateIssues({ ...base, bodyText: "a".repeat(1100) + " {{1}} end." }).some((i) => i.includes("body is over")),
);
check(
  "every fault is reported, not just the first",
  templateIssues({ ...base, name: "Bad Name", bodyText: "" }).length >= 2,
);

/* ------------------------------------------------------------- previews --- */

console.log("\nPreview");
check(
  "samples are substituted",
  previewWith(base.bodyText, base.sampleValues) === "Hi Ravi, your call is booked for Tuesday at 3 pm. See you then.",
);
check("a missing sample leaves the token visible", previewWith("Hi {{1}}", []) === "Hi {{1}}");

/* ------------------------------------------------- the email body itself --- */

console.log("\nEmail bodies");
check("a paragraph tag is HTML", looksLikeHtml("<p>hello</p>"));
check("an anchor is HTML", looksLikeHtml('Click <a href="https://x.example">here</a>'));
check("prose is not HTML", !looksLikeHtml("Hi Ravi,\n\nYour call is tomorrow."));
check("a lone angle bracket is not HTML", !looksLikeHtml("a < b and b > c"));
check(
  "HTML is passed through untouched",
  renderEmailBody("<p>Already written</p>") === "<p>Already written</p>",
);
check(
  "a blank line starts a new paragraph",
  textToHtml("One.\n\nTwo.") === "<p>One.</p>\n<p>Two.</p>",
);
check("a single newline is a break", textToHtml("One.\nTwo.") === "<p>One.<br />Two.</p>");
check(
  "a bare URL becomes a link",
  textToHtml("Join: https://x.example/a").includes('<a href="https://x.example/a">'),
);
check(
  "a full stop after a URL stays outside the link",
  textToHtml("See https://x.example/a.").includes('<a href="https://x.example/a">https://x.example/a</a>.'),
);

// 🔴 The one that matters most. This runs AFTER placeholders are filled, so the text
// contains a real person's name. A name with an angle bracket in it must not be able to
// close a tag and swallow the rest of the message.
check("angle brackets in a name are escaped", escapeHtml("Smith & Sons <sales>") === "Smith &amp; Sons &lt;sales&gt;");
check(
  "a hostile name cannot open a tag",
  !textToHtml("Hi <script>alert(1)</script>,").includes("<script>"),
);
check("an empty body converts to nothing", renderEmailBody("   ") === "");

console.log(
  failures === 0
    ? "\n🟢 Meta's rules are checked before Meta sees them, and prose becomes HTML without letting a name break it.\n"
    : `\n🔴 ${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
