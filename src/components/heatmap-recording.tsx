import Script from "next/script";

/**
 * Injects a tenant's heatmap / session-recording snippet (e.g. MS Clarity) on the
 * public funnel. Mounted in the /a/[slug] layout, so it loads on the opt-in page and
 * keeps running through audience select, every question, the submit, and the result
 * page — the full journey, like the recorder on the VSL page.
 *
 * The admin pastes the vendor snippet verbatim (usually wrapped in <script>…</script>).
 * next/script runs INLINE JS, so we strip the <script> wrapper tags and run the body —
 * which for Clarity is a self-contained IIFE that injects its own external tag. Renders
 * nothing when there is no code.
 */
export function HeatmapRecording({ code }: { code: string | null }) {
  if (!code) return null;
  const inner = code.replace(/<\/?script[^>]*>/gi, "").trim();
  if (!inner) return null;
  return (
    <Script id="heatmap-recording" strategy="afterInteractive">
      {inner}
    </Script>
  );
}
