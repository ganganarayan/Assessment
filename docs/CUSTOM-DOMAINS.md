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

**2. Worker**, deployed from this repo with wrangler

The Worker is `infra/cloudflare-worker.js` and its deploy configuration is
`infra/wrangler.toml`. `ORIGIN_HOST`, `ZONE_HOST` and the `*/*` route all live in that
file, under review, so the only thing held outside the repo is the secret.

```bash
npm run worker:check
```

That compiles the script and resolves the bindings without uploading anything. Then:

```bash
npm run worker:deploy && npm run verify:zone
```

🟢 **The repo is now the deployed artifact.** This replaces the old "Edit code → select
all → paste → Deploy" step, which is what made the 2026-10-14 outage possible: the
`ZONE_HOST` pass-through was committed (10089cf) while the running script still had none,
so a correct fix sat in git for hours changing nothing. Never paste into the dashboard
again. If someone does, the next `worker:deploy` silently reverts it, which is the
correct outcome and the reason to put the fix in git instead.

Authentication, once per machine: either `npx wrangler@4 login`, or export a
`CLOUDFLARE_API_TOKEN` with **Workers Scripts:Edit** plus `CLOUDFLARE_ACCOUNT_ID`. 🟡 This
is a *different* token from the `CLOUDFLARE_API_TOKEN` on the Railway service, which only
needs Zone:Read + SSL:Edit for custom hostnames. Do not assume the Railway one can deploy.

🔴 **The secret is set once, out of band, and is preserved by every later deploy:**

```bash
npx --yes wrangler@4 secret put PROXY_SECRET --config infra/wrangler.toml
```

It must equal Railway's `CLOUDFLARE_PROXY_SECRET`. Without it, `ORIGIN_HOST` is publicly
reachable and anyone could send `x-forwarded-host: <a tenant's domain>` and be served as
that tenant. `src/lib/tenant/forwarded-host.ts` ignores the header unless the secret
matches, so a mismatch fails safe, not open: every custom hostname resolves to the
platform and no tenant is impersonated.

### 🔴 Pre-flight, before the FIRST deploy only

Routes declared in `wrangler.toml` are *managed* by it: a deploy reconciles the live set
to that block, so a route in the dashboard but not in the file gets removed, and removing
`*/*` breaks every custom hostname at once. Twice, before shipping the first time:

1. **List the live routes** for the Worker in the dashboard (Workers & Pages →
   assess360-saas-proxy → Settings → Domains & Routes). If `*/*` on the zone is the only
   one, the file already matches and you are clear. If there are others, add them to
   `[[routes]]` before deploying, or comment the block out and keep managing routes in
   the dashboard. The script still deploys from the repo either way, which is the win.
2. **Check for an uncommitted hotfix.** `npm run worker:history` shows the deploy
   timestamps. A code deploy *after* the last commit to `infra/cloudflare-worker.js`
   means somebody pasted something that was never committed, and this deploy would
   discard it. Read it out of the dashboard and commit it first.

🟢 **Rollback** is `npm run worker:rollback`, and `npm run worker:tail` streams live
requests when something is wrong and you need to see which host is arriving.

🟡 **A dashboard variable edit is still not a code deploy.** That distinction caused the
outage and the dashboard will not warn you: a Deployments row named "Updated variable:
ZONE_HOST" changed no code. Now that both variables come from `wrangler.toml`, edit them
there and deploy, so the two can no longer disagree.

🟡 **wrangler is invoked through `npx`, not installed as a dependency.** It is a ~50MB
tool used for an occasional manual deploy, and adding it to devDependencies would make
every Railway build install it for nothing. Pinned to major 4 so the config format
cannot shift underneath this file.

🟡 **The structural fix** is still to put Cloudflare for SaaS on a zone that hosts nothing
else. The route has to be `*/*` (client hostnames are unknown in advance), so on a shared
zone one script is a single point of failure for every app on it. Deploying from the repo
removes the *paste* from that risk, not the shared blast radius. The free Workers plan
compounds it: past 100,000 requests in a UTC day the Worker stops (error 1027) and every
proxied host in the zone fails together. Workers Paid is $5/month.

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

- **`npm run verify:zone`, after every Worker deploy.** It asks which app answers each
  host in the zone - title plus the shape of `/api/version` - and fails when Assess360 is
  answering a host it does not own. 🔴 Never verify this with a status code: a rewritten
  request returns a healthy 200 from the wrong app, which is how "verified, all five
  return 200" was recorded on a zone that was already broken. Add new hosts to `FOREIGN`
  in `scripts/verify-zone.ts` as apps join the zone; a host nobody listed is a host the
  check cannot protect.
- `scripts/domain-doctor.ts`, what the app considers served, and why.
- Sign-in on the tenant's host proves the Worker secret is wired: if the header were
  being ignored, the host would resolve to the platform instead of the tenant.
