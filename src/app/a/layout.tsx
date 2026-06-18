import { MetaPixel } from "@/components/meta-pixel";

/**
 * Layout for the PUBLIC assessment funnel (/a/*). Mounts the Meta Pixel here so
 * PageView fires on the landing + result pages, but NOT on the admin app.
 */
export default function PublicAssessmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MetaPixel />
      {children}
    </>
  );
}
