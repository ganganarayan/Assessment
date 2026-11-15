/**
 * What Meta's "URL parameters" field should hold for an Assess360 funnel. utm_content
 * carries the ad id, which is what get_funnel_stats reads per ad by default
 * (ad_param = utm_content), so per-ad stats work with no further setup. Pure.
 */
export const META_URL_PARAMETERS =
  "utm_source={{site_source_name}}&utm_medium={{placement}}&utm_campaign={{campaign.name}}&utm_term={{adset.id}}&utm_content={{ad.id}}";

/** The ad hand-over for one funnel: the website URL, the URL parameters field, and the
 *  two joined, which is what Meta sends a clicker to. */
export function adLinkFor(origin: string, slug: string): { website_url: string; url_parameters: string; full_url: string } {
  const website = `${origin.replace(/\/+$/, "")}/a/${slug}`;
  return { website_url: website, url_parameters: META_URL_PARAMETERS, full_url: `${website}?${META_URL_PARAMETERS}` };
}
