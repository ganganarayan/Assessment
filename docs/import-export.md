# Assessment Import / Export

Move assessments between environments (e.g. **staging → production**) without
touching existing assessment functionality.

## Why

Build and refine an assessment on staging, export it, then import it into
production — no manual re-entry, no drift.

## One format in, one format out

There is exactly **one JSON format** and **one CSV format**. The same shape is
used for a single assessment and for "Export All" (a single assessment is just
an array of one), and import accepts that same shape verbatim — so **anything
you export re-imports cleanly**. There are no separate "structure" or
"responses" exports.

| Format | Role | Lossless | Re-importable |
| ------ | ---- | -------- | ------------- |
| **JSON** | Authoritative | ✅ Yes — full structure + meta + lead config | ✅ Yes |
| **CSV** | Spreadsheet-friendly | ✅ Yes — same fields, flat layout | ✅ Yes |

Both formats round-trip losslessly (structure, metadata, lead-capture config,
and result bands). JSON is the most compact; CSV is convenient for reviewing or
editing in a spreadsheet. The round-trip is covered by an automated test —
`npm run verify:transfer` (no database required).

## Export

- **Where:** Admin → Assessments → row actions → **Export** (JSON / CSV) for one
  assessment, or the header **Export All ▼** (JSON / CSV) for every assessment.
- **Endpoints** (super-admin / platform owner only; return a file download):
  - one: `GET /api/admin/assessments/<id>/export?format=json|csv`
  - all: `GET /api/admin/assessments/export-all?format=json|csv`
- IDs, tenant, owner, submissions, and timestamps are **stripped**;
  `displayOrder` is renumbered to a clean `0..n`.

## Import

- **Where:** Admin → **Import**.
- **Who:** Super Admin (platform owner) only.
- **Flow:** upload `.json`/`.csv` → server validates → **preview** (one row per
  assessment: name, slug, categories, questions, result bands, "exists?") →
  confirm → transactional import of **all** assessments in the file.
- **Validation:** structure is checked with Zod; `schemaVersion` must match the
  server (currently `1`). All validation errors are shown before any write.

### Duplicate slug handling

If any slug in the file already exists, you choose **one policy** applied to the
whole import:

- **Cancel** — do nothing.
- **Create copy** — existing slugs import under `…-copy` (auto-suffixed to stay
  unique); non-conflicting slugs keep their name.
- **Replace existing** — for each matching slug, delete the existing assessment
  **and its submissions** (FK cascade), then recreate. Destructive; confirmed in
  the UI.

(With no conflicts, import proceeds directly with no prompt.)

### Transactional safety

The entire import runs in **one database transaction**. If any step fails, the
whole import rolls back — **no partial imports**.

Imported assessments are always created as **DRAFT**, so you review and
**Publish** explicitly after import.

## JSON schema (v1)

The document is always `{ schemaVersion, exportedAt?, assessments: [...] }` —
one entry per assessment (an array of one for a single export):

```jsonc
{
  "schemaVersion": 1,
  "exportedAt": "2026-06-08T12:00:00.000Z",   // informational
  "assessments": [
    {
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
  ]
}
```

> Result bands are matched against the score **percentage (0–100)**, so they
> stay valid regardless of how many optional questions a respondent skips.

## CSV format

One flat file for one assessment or many. Rows are grouped by `assessment_slug`
and discriminated by `row_type` (`ASSESSMENT` / `CATEGORY` / `QUESTION` /
`OPTION` / `BAND`). Structure is **positional** via the `*_index` columns, never
by display text, so duplicate category names, repeated question wording, empty
categories, and exact ordering all survive a round-trip. Each row fills only the
columns relevant to its type; the rest are blank.

```
assessment_slug, row_type,
assessment_title, description, cover_image_url, estimated_minutes, thank_you_message,
collect_first_name, first_name_required, collect_last_name, last_name_required,
collect_email, email_required, collect_mobile, mobile_required,
category_index, category_name, category_description,
question_index, question_text, weight, required,
option_index, option_label, option_value,
band_index, band_level, band_title, band_description, band_min, band_max
```

- `ASSESSMENT` — one per assessment: title, meta, and the lead-capture flags.
- `CATEGORY` — one per category (`category_index` keys it); preserves empties.
- `QUESTION` — one per question (`category_index` + `question_index`).
- `OPTION` — one per option (`… + option_index`).
- `BAND` — one per result band (`band_index`).

Content fields are written/read verbatim (commas, quotes, and newlines are
RFC-4180 quoted), and a leading UTF-8 BOM (added by Excel/Windows on re-save) is
stripped on import. CSV carries the same data as JSON, so either format is an
exact copy.

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
