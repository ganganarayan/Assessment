import { PillarRoute, pillarMetadata } from "@/features/seo/pillar-route";

/** Content lives in src/content/seo/pages; this file only binds it to its URL. */
const SLUG = "lead-qualification-for-saas";

export const generateMetadata = () => pillarMetadata(SLUG);

export default function Page() {
  return <PillarRoute slug={SLUG} />;
}
