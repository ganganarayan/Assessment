import { cache } from "react";
import { resolveCta, type CtaConfig } from "@/lib/settings/config";

/**
 * The call to action, read once per request.
 *
 * Eight or nine separate components render a CTA on a single marketing page, and each
 * of them needs the same three values. React's `cache` collapses that into one query
 * per request, so a component can just ask for what it needs instead of every page
 * having to thread the object down through its whole tree.
 *
 * It lives in its own module rather than in settings/config.ts because `config.ts` is
 * imported by the verify scripts, which run as plain tsx outside any React render.
 *
 * Deliberately NOT cached across requests: the owner edits these fields and expects
 * the site to say the new thing, and revalidatePath already clears the page cache that
 * actually matters.
 */
export const getCta: () => Promise<CtaConfig> = cache(resolveCta);
