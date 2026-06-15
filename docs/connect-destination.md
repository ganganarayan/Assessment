# Connect your destination page

Assess360 stays completely decoupled from your video tool, CRM, and page builder.
After a respondent finishes an assessment, Assess360 does only three things:

1. Redirects to **your** destination page with an opaque token: `…?t=<token>`.
2. Exposes a tiny public read endpoint that returns that submission's results.
3. Fires two webhooks (lead captured, assessment completed) to your CRM.

Assess360 never knows about your video player, autoplay, or layout. You paste a
small connector and place a few placeholder tags; you keep full control of the page.

> The Assess360 admin UI (assessment → **Connect your destination page**) generates
> the exact Part A / Part B snippets below for your assessment, pre-filled with your
> categories — copy/paste, no editing required.

## 1. Set your Destination page URL

In the assessment settings, set **Destination page URL** to the https URL of the
page that should show the results (and host your video). That URL's **origin** is
what authorizes the read endpoint (CORS) — you never configure CORS yourself.

## 2. result_url format

Assess360 sends respondents to, and the completion webhook carries:

```
<your destination URL>?t=<token>
```

The token is random, single-use-ish, and **expires** (default 1 hour, configurable
per assessment). If no destination URL is set, Assess360 shows its built-in result
page instead.

## 3. Read endpoint

```
GET https://<assess360-host>/api/r/:token
```

Returns exactly:

```jsonc
{
  "customerId": "K7M2P9QX",
  "scorePercent": 78,
  "scoreRaw": 47,
  "max": 60,
  "resultBand": "Balanced",
  "categories": [
    { "name": "Sleep & Mental Recovery", "score": 10, "max": 12, "band": "Strong", "meaning": "…" }
  ]
}
```

- `404` if the token is unknown, `410` if expired.
- CORS: the response is readable **only** from your Destination page's origin.
- No auth — security is the unguessable, expiring token.

## 4. Host-page placeholder contract

Place these in your page; the connector fills them in:

- `#band-score` → `scorePercent`
- `#band-overall` → `resultBand`
- per category: `[data-cat="<exact category name>"][data-field="band|meaning|score"]`
- optional `#eval-state` → an "evaluating…" cover that is hidden once results load.

The category name in `data-cat` must match the assessment's category name exactly
(the generated Part B already does this for you).

## 5. Webhooks (to your CRM)

Both are flat, GoHighLevel-friendly `contact.*` custom fields keyed on
`contact.customer_id` (upsert your contact on that):

- **Lead captured** (`lead.created`): `contact_name`, `contact_email`,
  `contact_phone`, `contact.customer_id`, `contact.utm_*`.
- **Assessment completed** (`assessment.completed`): the above plus
  `contact.scorePercent`, `contact.scoreRaw`, `contact.max`, `contact.result_band`,
  `contact.result_url`, and per-category `contact.<Category Name> band|meaning|score`
  (a structured `metadata.categories` array is also included).

## 6. Per-category bands (admin)

Each category can have its own bands (percentage range → label + meaning). Until the
in-app editor ships, seed them from JSON:

```bash
npx tsx scripts/seed-category-bands.ts <assessment-slug> bands.json
```

```jsonc
// bands.json — percentages 0–100, ranges must not overlap
[
  { "name": "Sleep & Mental Recovery",
    "bands": [
      { "min": 0,  "max": 49,  "label": "Needs attention", "meaning": "…" },
      { "min": 50, "max": 100, "label": "Strong",          "meaning": "…" }
    ] }
]
```
