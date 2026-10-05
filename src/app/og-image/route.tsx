import { ImageResponse } from "next/og";
import { MARKETING } from "@/lib/marketing/content";

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
 */
export const runtime = "nodejs";
/** Immutable in practice: the card changes only when this file does. */
export const revalidate = 86400;

const SIZE = { width: 1200, height: 630 };

export function GET() {
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
              background: "#4f46e5",
            }}
          />
          <div style={{ display: "flex", fontSize: 34, color: "#f8fafc", fontWeight: 700 }}>
            {MARKETING.name}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              lineHeight: 1.1,
              color: "#f8fafc",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Qualify leads before the sales call
          </div>
          <div style={{ display: "flex", fontSize: 30, lineHeight: 1.35, color: "#94a3b8" }}>
            Score every prospect against your fit criteria, so your team only talks to the
            leads that are actually ready to buy.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", width: 60, height: 5, background: "#4f46e5" }} />
          <div style={{ display: "flex", fontSize: 24, color: "#94a3b8" }}>
            {MARKETING.domain.replace("https://", "")}
          </div>
        </div>
      </div>
    ),
    SIZE,
  );
}
