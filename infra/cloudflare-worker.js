/**
 * Assess360 - Cloudflare for SaaS edge Worker.
 *
 * WHAT IT SOLVES
 * Railway routes by Host header. A Cloudflare custom hostname forwards the customer's
 * own hostname (assess.acme.com), which Railway has never heard of, so the request
 * 404s before it reaches the app. Registering each host with Railway instead would
 * consume one custom-domain slot per tenant, the per-service cap this whole setup
 * exists to escape.
 *
 * So the Worker rewrites the request to a host Railway DOES route, and carries the
 * customer's real hostname in a header, with a shared secret proving the header came
 * from us. The app reads it back in src/lib/tenant/forwarded-host.ts.
 *
 * 🔴 The secret is what makes this safe. ORIGIN_HOST is publicly reachable, so without
 * it anyone could send `x-forwarded-host: assess.acme.com` straight to Railway and be
 * served as that tenant. PROXY_SECRET must match CLOUDFLARE_PROXY_SECRET in Railway,
 * and must be stored as a Worker SECRET (wrangler secret put / dashboard → Settings →
 * Variables → Encrypt), never a plaintext variable.
 *
 * DEPLOY
 *   1. Workers & Pages → Create Worker → paste this.
 *   2. Settings → Variables:
 *        ORIGIN_HOST   = assess-production.up.railway.app   (plaintext)
 *        PROXY_SECRET  = <same value as Railway's CLOUDFLARE_PROXY_SECRET>  (ENCRYPT)
 *   3. Settings → Domains & Routes → add route:  *\/*  on the zone that owns the
 *      custom hostnames, so every custom hostname request passes through here.
 */

export default {
  /**
   * @param {Request} request
   * @param {{ ORIGIN_HOST: string, PROXY_SECRET: string }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const customerHost = url.hostname;

    // Send it to the host Railway routes; keep path, query and method untouched.
    url.hostname = env.ORIGIN_HOST;
    url.protocol = "https:";
    url.port = "";

    const headers = new Headers(request.headers);
    headers.set("x-forwarded-host", customerHost);
    headers.set("x-forwarded-proto", "https");
    headers.set("x-assess-proxy", env.PROXY_SECRET);

    // Host must match the origin we are actually connecting to, or Railway's router
    // rejects it, that rewrite is the entire point of this Worker.
    headers.set("host", env.ORIGIN_HOST);

    const proxied = new Request(url.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    return fetch(proxied);
  },
};
