/**
 * Layout for the PUBLIC assessment funnel (/a/*). The Meta Pixel is mounted one
 * level down, in /a/[slug]/layout.tsx, so it can be resolved PER TENANT from the
 * assessment being viewed (rather than a single build-time env pixel).
 */
export default function PublicAssessmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
