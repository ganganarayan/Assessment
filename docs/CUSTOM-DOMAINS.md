# Unlimited tenant domains - Cloudflare for SaaS

## Why

Railway caps **custom domains per service** by plan. Every tenant that brings its own
domain consumes one slot, so the plan tier, not the product, decides how many tenants
can have a domain. We hit it at the third one:

```
Railway API: You have reached the limit for custom domains per service on your plan.
```

Cloudflare for SaaS registers a customer hostname against **our** zone, issues and
renews its certificate, and forwards to us. Railway is never told about the host, so no
slot is used. 100 custom hostnames are included free, then ~$0.10/hostname/month.

## How a request flows

```
assess.acme.com
   → Cloudflare edge          TLS terminated with the cert CF issued for that hostname
   → Worker                   rewrites Host to the Railway host, adds x-forwarded-host
                              + the shared secret
   → assess-production.up.railway.app     Railway routes it (a host it already knows)
   → app                      effectiveHost() reads the real hostname back
```

🔴 **The shared secret is load-bearing.** Railway's generated domain is public, so
without it anyone could send `x-forwarded-host: assess.acme.com` directly and be served
as that tenant. `src/lib/tenant/forwarded-host.ts` ignores the header unless the secret
matches, and falls back to the real Host, which is always truthful.

## Setup

**1. Cloudflare dashboard** (zone: the domain you want hostnames registered against)

- SSL/TLS → Custom Hostnames → enable Cloudflare for SaaS.
- Create the **fallback origin** - any name you like under the zone, e.g.
  `fallback.divineleads.guru` - as a CNAME to the Railway host
  (`assess-production.up.railway.app`). This is what customers point at.
  🔴 It must be **PROXIED** (orange cloud). Cloudflare's own UI says so: "The Fallback
  Origin needs to be a proxied DNS record in your zone." An earlier version of this doc
  said DNS-only, which cannot work - an unproxied record never reaches the Worker, so
  custom hostnames resolve past the edge and Railway 404s on a host it has never heard
  of. The customer's own CNAME, pointing AT this name, is the one that stays DNS-only.
- SSL/TLS → Overview: the zone's encryption mode must be **Full** (or Full strict), since
  the proxied hop to Railway is HTTPS.
- Note the **Zone ID** from the zone overview. Whatever you named the fallback goes into
  `CLOUDFLARE_SAAS_FALLBACK` verbatim; nothing in the code assumes the word "cname".

**2. Worker**, deploy `infra/cloudflare-worker.js`

- Variables: `ORIGIN_HOST` = the Railway host (plaintext);
  `PROXY_SECRET` = a long random string (**encrypted**).
- Route: `*/*` on that zone, so every custom hostname passes through it.

**3. Railway variables** (the app service)

| Variable | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token with Zone:Read + SSL:Edit (+ DNS:Edit for the older path) |
| `CLOUDFLARE_SAAS_ZONE_ID` | the zone id from step 1 |
| `CLOUDFLARE_SAAS_FALLBACK` | `cname.divineleads.guru` |
| `CLOUDFLARE_PROXY_SECRET` | **the same value** as the Worker's `PROXY_SECRET` |

All four are optional. Missing any one and `cloudflareSaasConfigured()` is false and the
app falls back to the Railway path exactly as before, nothing breaks, the ceiling just
comes back.

## What a tenant does

Add the domain in their workspace, then add **one CNAME**: `assess` →
`cname.divineleads.guru`, DNS-only / unproxied. Cloudflare validates over HTTP once that
resolves, issues the certificate, and "Check status" turns it live.

## Verifying

- `scripts/domain-doctor.ts`, what the app considers served, and why.
- Sign-in on the tenant's host proves the Worker secret is wired: if the header were
  being ignored, the host would resolve to the platform instead of the tenant.
