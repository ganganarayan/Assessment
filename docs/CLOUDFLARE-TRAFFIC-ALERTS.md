# Traffic alerts on custom domains, and the 100,000/day wall

Parked 2026-10-14. Revisit when agency onboarding brings real custom-domain traffic.
Verified against Cloudflare docs dated Oct 2 2026, not from memory.

## The question

"Email me when a custom domain crosses 1 lakh hits."

## What Cloudflare does NOT have

* No built-in alert for a request count on a hostname. The only traffic-volume alerts are
  Traffic Anomalies and Advanced Error Rate, both **Enterprise only**, and the docs say
  plainly: "These thresholds cannot be configured" (z-score and SLO driven, not a number).
* Usage Based Billing alert is **Professional+ and Pay-as-you-go only**, and its threshold is
  per product (Argo bytes, Load Balancing DNS queries). Custom-hostname hits are not a product
  it covers.
* Budget alerts fire on **dollars of usage-based spend**, not on hits.
* Workers built-in notifications are only a weekly usage summary and a CPU anomaly alert
  (fires at 25% above the Worker's own 7-day average CPU). There is **no** "you are nearing
  100,000 requests today" email.

## What Cloudflare DOES have: Custom Alerts (Beta)

Runs a SQL query on a schedule, emails when the result crosses a fixed number.

* Dataset `events.httpRequests`, column `clientRequestHttpHost`, so it scopes to one custom
  domain or the whole account.
* Detection **Threshold**, operator `>`, value `100000`.
* Up to **20 email recipients**. Webhooks on all plans, PagerDuty needs Business+.
* Execution interval as low as **1 minute**, repeat-notification interval default 1h.
* Dash path: **Alerts > Overview > Create an Alert**.

```sql
SELECT COUNT(*) AS value FROM events.httpRequests
WHERE accountTag = '<ACCOUNT_TAG>'
  AND clientRequestHttpHost = 'client.example.com'
  AND timestamp >= NOW() - INTERVAL '24' HOUR
```

### The one open variable

"The datasets available to Custom Alerts depend on your plan and permissions", and for SaaS
specifically "the plan of your Cloudflare for SaaS application determines the analytics
available for your custom hostnames". Cloudflare's own docs contradict themselves on whether
free zones reach the GraphQL/SQL analytics APIs. Settle it with one call:

```bash
curl --get "https://api.cloudflare.com/client/v4/analytics/sql/introspection" \
  --header "Authorization: Bearer <API_TOKEN>" \
  --data-urlencode "account_tag=<ACCOUNT_TAG>" \
  --data-urlencode "dataset_name=events.httpRequests"
```

Caveat from the same docs: appearing in the catalogue does not prove you may query it. The real
proof is running the COUNT once. If it works, the dashboard Custom Alert needs no code at all.

## 1 lakh is not a Cloudflare for SaaS number

Cloudflare for SaaS: 100 custom hostnames included on Free, Pro and Business, $0.10 per extra,
max 50,000, and **no request-based billing or request limit at all**.

The only 100,000 in this stack is **Workers Free: 100,000 requests/day, resetting midnight UTC,
then Error 1027**. It is account-wide across every Worker, so the SaaS router Worker
(infra/cloudflare-worker.js) shares it with anything else we deploy. The route's fail mode
decides the blast radius:

| Route mode | Behavior when the cap is hit |
| --- | --- |
| Fail open | Bypasses the Worker. Requests behave as if no Worker is configured. |
| Fail closed | Returns the Cloudflare 1027 error page. |

For our router, fail open means a customer hostname goes to whatever its DNS names instead of
being rewritten to Railway, which is the shape of the zone outage we already hit once.

Workers Paid ($5/mo) removes the cliff: 10M requests/month included, then $0.30 per million.
An alert's real job is to tell us **when that $5 becomes worth paying**, not to prevent anything.

## Email delivery: free, but not on our zone

Email Routing and sending are now **Cloudflare Email Service**. A Worker sends with a
`send_email` binding. Outbound Email Sending is "Not available" on Workers Free, **but**
"sending to verified destination addresses in your account is free on all plans, including when
only Email Routing is configured", and those sends "do not count toward your monthly quota or
your daily sending limits". Our own inbox as a verified destination is exactly that case.

### 🔴 Why we cannot use it on divineleads.guru

The free path needs Email Routing on a routing domain, and "Email Routing is a zone-level
feature that applies to the apex domain by default". Subdomains are added from the apex's Email
Routing settings, so the apex is switched on first. Enabling it on divineleads.guru puts
Cloudflare MX on the apex and **breaks Zoho inbound mail for connect@divineleads.guru**.
Not worth it for an alert email.

So send via the ZeptoMail HTTPS API (already the standing pattern, no DNS change), behind a
single sender function that can flip to the Cloudflare binding if we ever own a mail-free zone.

## The build, if Custom Alerts turns out unavailable

A standalone Worker, independent of the Next app and of Railway.

* `infra/quota-watch.js`, hand-pasted into a new Worker like the router Worker.
* Cron every 30 min. Cron Triggers run on Workers Free; the cap is **5 cron triggers per
  account** (250 on Paid), 10 ms CPU per invocation, 15 min max wall time. 48 invocations/day is
  ~0.05% of the quota it guards.
* One KV namespace, a key per UTC day per tier, so each tier emails once per day. A few writes a
  day, far under the free 1,000/day.
* Counts, in order of truth: account-wide Workers invocations if the plan exposes that node,
  else zone HTTP requests via `httpRequestsAdaptiveGroups`, grouped by `clientRequestHTTPHost`
  so the email names the custom domain driving it. Window since UTC midnight, because that is
  when the cap resets.
* Tiers 50,000 / 80,000 / 95,000 of the 100,000.
* Secrets: CF_API_TOKEN (Account Analytics Read), account tag, zone tag, ZeptoMail token,
  recipient.
* Token-guarded `/status` route for an on-demand check.
* If both analytics nodes are denied, email the raw API error once, so we learn immediately.

## Also worth switching on, unrelated to hits

**SSL for SaaS Custom Hostnames Alert**: validation, issuance, renewal and expiry of custom
hostname certificates. That maps straight onto the show-the-DNS-records flow in
docs/CUSTOM-DOMAINS.md, where the client self-adds records and we poll for status.

## Sources

* https://developers.cloudflare.com/notifications/notification-available/
* https://developers.cloudflare.com/notifications/
* https://developers.cloudflare.com/workers/platform/limits/
* https://developers.cloudflare.com/workers/platform/pricing/
* https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/
* https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/quotas-and-billing/
* https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/hostname-analytics/
* https://developers.cloudflare.com/analytics/sql-api/
* https://developers.cloudflare.com/analytics/graphql-api/limits/
* https://developers.cloudflare.com/billing/manage/budget-alerts/
* https://developers.cloudflare.com/email-service/platform/pricing/
* https://developers.cloudflare.com/email-service/platform/limits/
* https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
* https://developers.cloudflare.com/email-service/configuration/subdomains/
* https://blog.cloudflare.com/introducing-workers-usage-notifications/
