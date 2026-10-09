import { ImageResponse } from "next/og";
import { MARKETING } from "@/lib/marketing/content";
import { getPage } from "@/lib/seo/registry";

/**
 * The share card, generated rather than stored.
 *
 * og:image and twitter:image pointed at /og-image.png for as long as the landing page has
 * existed, and that file has never been in public/ - so every share, every Slack unfurl
 * and the Organization logo in the structured data resolved to a 404.
 *
 * This is a ROUTE rather than Next's app/opengraph-image file convention on purpose. The
 * convention injects its image into every route under app/, which here would mean a
 * tenant's funnel - on the tenant's own custom domain, on a plan whose whole promise is
 * that the Assess360 badge comes off - unfurling as an Assess360 card. Being a plain route
 * means only the pages that ASK for it get it: the marketing and policy pages do, tenant
 * surfaces keep no og:image at all, which is what they had before and is not a regression.
 *
 * PER-PAGE CARDS come from `?slug=`, and the title is looked UP from the content registry
 * rather than read from the query string.
 *
 * 🔴 That is the whole security design of this endpoint. A `?title=` parameter would let
 * anyone render an image on our own domain saying anything they liked, and share it as
 * though we had published it - an unfurl carries the domain, not the author. Keyed on a
 * slug, the only cards that can exist are the ones for pages that exist. An unknown slug
 * falls back to the generic card rather than erroring, so a stale link still unfurls.
 */
export const runtime = "nodejs";
/** Immutable in practice: the card changes only when this file does. */
export const revalidate = 86400;

const SIZE = { width: 1200, height: 630 };

/**
 * One accent and one label per page kind, so a guide, an industry page and a comparison
 * are distinguishable in a feed before the title is read. Same layout for all of them:
 * the point is recognition, not three designs to keep in step.
 */
const KINDS: Record<string, { label: string; accent: string }> = {
  pillar: { label: "Guide", accent: "#16a34a" },
  "use-case": { label: "For your industry", accent: "#0ea5e9" },
  comparison: { label: "Compared", accent: "#f59e0b" },
  glossary: { label: "Reference", accent: "#8b5cf6" },
};

const DEFAULT_ACCENT = "#4f46e5";

export function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  const page = slug ? getPage(slug) : null;
  const kind = page ? KINDS[page.kind] : null;
  const accent = kind?.accent ?? DEFAULT_ACCENT;
  const headline = page ? page.h1 : "Qualify leads before the sales call";
  const sub = page
    ? page.description
    : "Score every prospect against your fit criteria, so your team only talks to the leads that are actually ready to buy.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0f172a",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: accent,
            }}
          />
          <div style={{ display: "flex", fontSize: 34, color: "#f8fafc", fontWeight: 700 }}>
            {MARKETING.name}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {kind ? (
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: accent,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {kind.label}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: page ? 56 : 68,
              lineHeight: 1.1,
              color: "#f8fafc",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {headline}
          </div>
          <div style={{ display: "flex", fontSize: 28, lineHeight: 1.35, color: "#94a3b8" }}>
            {sub}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", width: 60, height: 5, background: accent }} />
          <div style={{ display: "flex", fontSize: 24, color: "#94a3b8" }}>
            {MARKETING.domain.replace("https://", "")}
          </div>
        </div>
      </div>
    ),
    SIZE,
  );
}
