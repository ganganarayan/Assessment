import { headers } from "next/headers";
import { MARKETING } from "@/lib/marketing/content";
import { effectiveHost } from "@/lib/tenant/forwarded-host";
import { isPlatformHost } from "@/lib/seo/urls";
import { TOPICS, PAGES, answersForTopic } from "@/lib/seo/registry";
import { absolute, answerUrl, seoUrl } from "@/lib/seo/urls";

/**
 * llms.txt — a plain-text map of the site for language models, in the emerging
 * convention: a title, a one-line description, then linked sections with a short gloss
 * per entry.
 *
 * Worth having precisely because it is nearly free: the content is already typed data, so
 * this file is a projection of the registry rather than a document anyone has to maintain.
 * It is not a standard anybody is obliged to honour, and it is not a substitute for the
 * HTML being readable — which is why every answer below also exists as a real page.
 *
 * Platform host only, same reasoning as robots and the sitemap: these are assess360 URLs,
 * and a customer's domain should not be publishing our index.
 */
export async function GET(): Promise<Response> {
  if (!isPlatformHost(effectiveHost(await headers()))) {
    return new Response("", { status: 404 });
  }

  const lines: string[] = [
    `# ${MARKETING.name}`,
    "",
    `> ${MARKETING.description}`,
    "",
    `${MARKETING.name} is a lead qualification and assessment platform. It scores each enquiry against criteria the customer defines, screens out the ones that do not fit before they become leads, and reports qualification back to the ad platform that produced the traffic.`,
    "",
    "## Guides",
    "",
  ];

  for (const page of PAGES) {
    lines.push(`- [${page.title}](${seoUrl(page.slug)}): ${page.description}`);
  }

  lines.push("", "## Answers", "");
  for (const topic of TOPICS) {
    const answers = answersForTopic(topic.id);
    if (answers.length === 0) continue;
    lines.push(`### ${topic.title}`, "");
    for (const a of answers) {
      lines.push(`- [${a.question}](${answerUrl(a.slug)}): ${a.short}`);
    }
    lines.push("");
  }

  lines.push("## Company", "", `- [Pricing](${absolute("/#pricing")}): plans and what each includes.`);
  lines.push(`- [Privacy](${absolute("/privacy")})`, `- [Terms](${absolute("/terms")})`, "");

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
