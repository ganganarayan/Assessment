# Assessment Import / Export

Move assessments between environments (e.g. **staging → production**) without
touching existing assessment functionality.

## Why

Build and refine an assessment on staging, export it, then import it into
production — no manual re-entry, no drift.

## Formats

| Format | Role | Lossless | Re-importable |
| ------ | ---- | -------- | ------------- |
| **JSON** | Authoritative | ✅ Yes — full structure + lead config | ✅ Yes |
| **CSV** | Backup / reporting | ⚠️ Structure + bands only | ✅ Yes (lead config + meta default on import) |

Always use **JSON** for environment migration. CSV is for human-readable
backup/reporting and quick structural review in a spreadsheet.

## Export

- **Where:** Admin → Assessments → row actions → **Export** (JSON) / **CSV**.
- **Endpoint:** `GET /api/admin/assessments/<id>/export?format=json|csv`
  (super-admin / platform owner only; returns a file download).
- IDs, tenant, owner, submissions, and timestamps are **stripped**;
  `displayOrder` is renumbered to a clean `0..n`.

## Import

- **Where:** Admin → **Import**.
- **Who:** Super Admin (platform owner) only.
- **Flow:** upload `.json`/`.csv` → server validates → **preview**
  (name, categories, questions, result bands) → confirm → transactional import.
- **Validation:** structure is checked with Zod; `schemaVersion` must match the
  server (currently `1`). All validation errors are shown before any write.

### Duplicate slug handling

If the slug already exists, you choose:

- **Cancel** — do nothing.
- **Create copy** — import under `…-copy` (auto-suffixed to stay unique).
- **Replace existing** — delete the existing assessment **and its submissions**
  (FK cascade), then recreate. Destructive; confirmed in the UI.

### Transactional safety

The entire import runs in **one database transaction**. If any step fails, the
whole import rolls back — **no partial imports**.

Imported assessments are always created as **DRAFT**, so you review and
**Publish** explicitly after import.

## JSON schema (v1)

```jsonc
{
  "schemaVersion": 1,
  "exportedAt": "2026-06-08T12:00:00.000Z",   // informational
  "assessment": {
    "title": "Emotional Status",
    "slug": "emotional-status",
    "description": "…",                        // nullable
    "coverImageUrl": "https://…",              // nullable
    "estimatedMinutes": 5,                      // nullable
    "thankYouMessage": "…",                    // nullable
    "collectFirstName": true,  "firstNameRequired": false,
    "collectLastName":  true,  "lastNameRequired":  false,
    "collectEmail":     true,  "emailRequired":     true,
    "collectMobile":    true,  "mobileRequired":    false,
    "categories": [
      {
        "name": "Stress",
        "description": null,
        "displayOrder": 0,
        "questions": [
          {
            "text": "How often do you feel overwhelmed?",
            "type": "SINGLE_SELECT",
            "weight": 1,
            "required": true,
            "displayOrder": 0,
            "options": [
              { "label": "Never",      "value": 1, "displayOrder": 0 },
              { "label": "Rarely",     "value": 2, "displayOrder": 1 },
              { "label": "Often",      "value": 3, "displayOrder": 2 },
              { "label": "Very Often", "value": 4, "displayOrder": 3 }
            ]
          }
        ]
      }
    ],
    "resultBands": [
      {
        "level": "LOW",          // LOW | MEDIUM | HIGH | CRITICAL
        "title": "Low stress",
        "description": "…",      // nullable
        "minScore": 0,            // PERCENTAGE 0–100 (banding basis)
        "maxScore": 25,
        "displayOrder": 0
      }
    ]
  }
}
```

> Result bands are matched against the score **percentage (0–100)**, so they
> stay valid regardless of how many optional questions a respondent skips.

## CSV format

A flat file with a `row_type` discriminator:

- `QUESTION_OPTION` rows: `title, slug, category, category_order, question,
  weight, required, question_order, option_label, option_value, option_order`.
- `BAND` rows: `title, slug, band_level, band_title, band_description, band_min,
  band_max, band_order`.

CSV import reconstructs categories → questions → options and result bands, but
**cannot** carry lead-capture config or assessment meta (description, cover,
estimated time, thank-you) — those default. Use JSON for an exact copy.

## Migration workflow: staging → production

1. On **staging**, build/refine the assessment and verify it.
2. Admin → Assessments → **Export** (JSON). Save the file.
3. On **production**, Admin → **Import** → upload the JSON.
4. Review the **preview**; resolve duplicate slug if prompted.
5. Confirm. The assessment is created as **DRAFT**.
6. Review on production, then **Publish**.

## Round-trip test (manual)

1. Export an assessment as JSON.
2. Import it (**Create copy**) → opens as `…-copy` (DRAFT).
3. Compare structure (categories/questions/options/bands) — identical.
4. Delete the copy.
5. Re-import the same JSON to confirm repeatability.
