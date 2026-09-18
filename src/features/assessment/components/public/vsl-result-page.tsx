import { appendVidapulseId } from "@/lib/vidapulse";
import {
  themeOf,
  extractEmbedSrc,
  youtubeEmbedUrl,
  normalizeHref,
  type ResultPageData,
  type ResultBlock,
  type TextAlign,
  type ButtonConfig,
  type TestimonialsConfig,
  type FooterConfig,
} from "@/features/assessment/result-page/blocks";

/**
 * Public VSL result page (RESULTS mode). A self-contained marketing page rendered
 * from the assessment's published resultPage: eyebrow / headline / subhead, the
 * respondent's AI statement, a VSL video embed, styled buttons and YouTube
 * testimonials, footer. Mobile-first single column. Colours are dynamic (per-page
 * theme), so they are applied as inline styles rather than Tailwind tokens. No
 * scores/bands — pure marketing. Reachable in the IG in-app browser via the token
 * link, no sign-in.
 */
export function VslResultPage({
  page,
  aiStatement,
  customerId,
  vidapulseParam,
}: {
  page: ResultPageData;
  aiStatement: string | null;
  customerId: string | null;
  vidapulseParam: string | null;
}) {
  const t = themeOf(page.theme);
  return (
    <main style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      {/* Fluid container: fills the available width with responsive left/right gutters
          (16px on a phone → up to ~64px on a wide screen), capped so text stays
          readable on very large monitors instead of being a narrow fixed column. */}
      <div
        style={{
          width: "100%",
          maxWidth: 1200,
          margin: "0 auto",
          padding: "32px clamp(16px, 5vw, 64px) 64px",
          boxSizing: "border-box",
        }}
        className="flex flex-col gap-6"
      >
        {page.blocks.map((b) => (
          <Block
            key={b.id}
            block={b}
            theme={t}
            aiStatement={aiStatement}
            customerId={customerId}
            vidapulseParam={vidapulseParam}
          />
        ))}
      </div>
    </main>
  );
}

function align(a: unknown): TextAlign {
  return a === "left" || a === "right" ? a : "center";
}

function Block({
  block,
  theme,
  aiStatement,
  customerId,
  vidapulseParam,
}: {
  block: ResultBlock;
  theme: ReturnType<typeof themeOf>;
  aiStatement: string | null;
  customerId: string | null;
  vidapulseParam: string | null;
}) {
  const c = block.config as Record<string, unknown>;
  const str = (k: string) => (typeof c[k] === "string" ? (c[k] as string).trim() : "");

  switch (block.type) {
    case "eyebrow": {
      const text = str("text");
      if (!text) return null;
      return (
        <p style={{ color: theme.cta, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 13, fontWeight: 600 }}>
          {text}
        </p>
      );
    }
    case "headline": {
      const text = str("text");
      if (!text) return null;
      return (
        <h1 style={{ textAlign: "center", fontSize: 30, lineHeight: 1.2, fontWeight: 800, margin: 0 }}>{text}</h1>
      );
    }
    case "subhead": {
      const text = str("text");
      if (!text) return null;
      return (
        <p style={{ textAlign: "center", fontSize: 18, color: theme.muted, margin: 0 }}>{text}</p>
      );
    }
    case "text": {
      const text = str("text");
      if (!text) return null;
      return (
        <p style={{ textAlign: align(c.align), whiteSpace: "pre-line", margin: 0 }}>{text}</p>
      );
    }
    case "ai_statement": {
      const body = (aiStatement && aiStatement.trim()) || str("fallback");
      if (!body) return null;
      return (
        <div
          style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: "18px 20px" }}
        >
          <p style={{ whiteSpace: "pre-line", margin: 0, fontSize: 17, lineHeight: 1.55 }}>{body}</p>
        </div>
      );
    }
    case "button":
      return <ButtonBlock config={c as ButtonConfig} theme={theme} />;
    case "video":
      return <VideoBlock code={str("embedCode")} customerId={customerId} vidapulseParam={vidapulseParam} />;
    case "testimonials":
      return <TestimonialsBlock config={c as TestimonialsConfig} theme={theme} />;
    case "footer":
      return <FooterBlock config={c as FooterConfig} theme={theme} />;
    default:
      return null;
  }
}

function ButtonBlock({ config, theme }: { config: ButtonConfig; theme: ReturnType<typeof themeOf> }) {
  const label = (config.label ?? "").trim();
  // The link is used EXACTLY as typed (normalizeHref only fixes a missing scheme).
  const href = normalizeHref(config.url);
  if (!label) return null;
  const bg = (config.bg ?? "").trim() || theme.cta;
  const color = (config.color ?? "").trim() || theme.ctaText;
  const fontSize = typeof config.fontSize === "number" && config.fontSize > 0 ? config.fontSize : 18;
  const a = align(config.align);
  const justify = a === "left" ? "flex-start" : a === "right" ? "flex-end" : "center";
  return (
    <div style={{ display: "flex", justifyContent: justify }}>
      <a
        href={href ?? "#"}
        target={href ? "_blank" : undefined}
        rel={href ? "noreferrer" : undefined}
        style={{
          display: "inline-block",
          background: bg,
          color,
          fontSize,
          fontWeight: 700,
          padding: "14px 28px",
          borderRadius: 10,
          textDecoration: "none",
          textAlign: "center",
        }}
      >
        {label}
      </a>
    </div>
  );
}

function VideoBlock({
  code,
  customerId,
  vidapulseParam,
}: {
  code: string;
  customerId: string | null;
  vidapulseParam: string | null;
}) {
  const src = extractEmbedSrc(code);
  if (!src) return null;
  // Carry the opaque VidaPulse id into the embed (identity bridge) — no-op for a
  // non-absolute src or when tracking is off / no customerId.
  const finalSrc = appendVidapulseId(src, vidapulseParam, customerId);
  return (
    <div style={{ width: "100%", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: 12, overflow: "hidden" }}>
        <iframe
          src={finalSrc}
          title="Video"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
    </div>
  );
}

function TestimonialsBlock({ config, theme }: { config: TestimonialsConfig; theme: ReturnType<typeof themeOf> }) {
  const items = (Array.isArray(config.items) ? config.items : []).filter((i) => (i?.url ?? "").trim());
  const heading = (config.heading ?? "").trim();
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {heading ? <h2 style={{ textAlign: "center", fontSize: 22, fontWeight: 700, margin: 0 }}>{heading}</h2> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map((it, i) => {
          const embed = youtubeEmbedUrl(it.url);
          return (
            <div key={i} className="flex flex-col gap-2">
              {embed ? (
                <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: 10, overflow: "hidden" }}>
                  <iframe
                    src={embed}
                    title={(it.name ?? "").trim() || `Testimonial ${i + 1}`}
                    allow="accelerometer; encrypted-media; picture-in-picture"
                    allowFullScreen
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  />
                </div>
              ) : (
                <a href={(it.url ?? "").trim()} target="_blank" rel="noreferrer" style={{ color: theme.cta }}>
                  Watch
                </a>
              )}
              <div style={{ textAlign: "center" }}>
                {(it.name ?? "").trim() ? <p style={{ margin: 0, fontWeight: 600 }}>{(it.name ?? "").trim()}</p> : null}
                {(it.role ?? "").trim() ? <p style={{ margin: 0, fontSize: 13, color: theme.muted }}>{(it.role ?? "").trim()}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FooterBlock({ config, theme }: { config: FooterConfig; theme: ReturnType<typeof themeOf> }) {
  const links = (Array.isArray(config.links) ? config.links : []).filter((l) => (l?.label ?? "").trim());
  const disclaimer = (config.disclaimer ?? "").trim();
  const copyright = (config.copyright ?? "").trim();
  if (links.length === 0 && !disclaimer && !copyright) return null;
  return (
    <footer style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 20, marginTop: 8 }} className="flex flex-col gap-3">
      {links.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          {links.map((l, i) => {
            const href = normalizeHref(l.url);
            return (
              <a
                key={i}
                href={href ?? "#"}
                target={href ? "_blank" : undefined}
                rel={href ? "noreferrer" : undefined}
                style={{ color: theme.muted, fontSize: 13, textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.04em" }}
              >
                {(l.label ?? "").trim()}
              </a>
            );
          })}
        </div>
      ) : null}
      {disclaimer ? <p style={{ textAlign: "center", fontSize: 12, color: theme.muted, margin: 0, lineHeight: 1.5 }}>{disclaimer}</p> : null}
      {copyright ? <p style={{ textAlign: "center", fontSize: 12, color: theme.muted, margin: 0 }}>{copyright}</p> : null}
    </footer>
  );
}
