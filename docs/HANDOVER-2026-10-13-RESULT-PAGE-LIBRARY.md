# Result pages become a library (2026-10-13)

## What changed

Both result pages are now records of their own, in a library you clone from, bound 1:1
to an assessment:

- **Results page** (builder step 12) - the page shown straight after the questions.
- **VSL result page** (builder step 13) - the marketing page on the token link.

Before this, each page was a child of one funnel: the results page as `assessment_page`
rows plus a published snapshot on the assessment, the VSL page as two JSON columns on
the assessment. Building the next funnel meant rebuilding the same eyebrow, headline,
video and footer by hand.

## The model

`ResultPageDoc` (table `result_page_doc`): `kind` (RESULTS | VSL), `title`, `slug`
(unique per workspace), `published` + `publishedAt`, `sourceSlug` (provenance),
`tenantId`.

Each kind keeps the storage it already had, which is what made this a re-parent rather
than a rewrite of two working builders:

- **VSL** - draft and published are both `ResultPageData` JSON on the doc.
- **RESULTS** - the draft is `assessment_page` rows, now pointing at `docId` instead of
  `assessmentId`; published is `AssessmentPageData[]` JSON on the doc.

## The binding

`assessment.resultsDocId` and `assessment.vslDocId`, both **UNIQUE**. The 1:1 rule is
the database's, not an action's: no two funnels can ever share a page, so an edit here
can never reword a page that another funnel's ad traffic is landing on, and a per-funnel
value (a booking inbox, a calendar link, an exit-route block) is always right for the
one funnel it serves. Need the same page twice? Clone it.

`onDelete: SetNull` - deleting an assessment frees its pages back into the library
rather than destroying work worth cloning.

## What is live, and why that is the safe part

🟢 **The public read path did not move.** The funnel still renders
`assessment.publishedPages`; the token page still renders
`assessment.resultPagePublished`; `/api/cta/...` still resolves the clicked button from
`assessment.resultPagePublished`.

Publishing a doc writes its own snapshot and then **mirrors** it onto the bound
assessment (`features/result-pages/mirror.ts`). That mirror is the only coupling between
the library and anything a respondent can see. Consequences worth knowing:

- Unbinding a page clears the funnel's live snapshot, so the funnel falls back to what
  it did before any page existed. A live page editable from nowhere is the state this
  feature exists to remove.
- Deleting a bound page is refused. Unbind it on the assessment first.
- A free (unbound) page can be edited and published all day and shows to nobody. The
  editor says so.
- The migration's backfill never writes to those live columns, so a wrong backfill
  costs an edit, not a funnel.

## Screens

- `/admin/result-pages` and `/w/result-pages` - the library. Each row says **Free to
  use** or **Used by <funnel>**, plus Published/Draft, with Edit / Clone / Rename /
  Delete. Nav entry: Build → Result pages, on both surfaces.
- `/admin/result-pages/<id>` and `/w/result-pages/<id>` - one page, in its own editor.
  Both existing builders are reused unchanged; they take a `docId` now.
- Builder steps 12 and 13 no longer hold an editor. They bind: a dropdown of **free**
  pages of that kind, "Start a new page", and a link into the library. A page in use
  elsewhere is deliberately absent from the dropdown rather than offered and refused.

## Migration

`prisma/migrations/20261013233000_result_page_docs` creates the table, adds the two
unique links, adds `assessment_page.docId`, then backfills:

- one RESULTS doc per assessment that had draft pages or a published snapshot, with the
  rows re-pointed at it;
- one VSL doc per assessment that had `resultPage` or `resultPagePublished`, the draft
  falling back to the published blob so a page that was published and never re-drafted
  opens with its own content.

Doc ids are derived (`rpd_r_<assessmentId>`, `rpd_v_<assessmentId>`) so the follow-up
updates need no round trip. Slugs derive from the assessment slug, which is globally
unique and therefore unique within the workspace too.

`NULL tenantId` is the platform's own library, and NULLs never collide in a Postgres
unique index - so a partial unique index (`result_page_doc_platform_slug_key`) is what
actually keeps the platform's slugs unique.

## Carried-over paths

- **Import** (`createResultDocsForImport`) - the transfer shape still carries page
  content inside the body by value, deliberately, so a template stays self-contained.
  On import that content becomes docs bound to the new assessment. This also fixes an
  old quirk: an imported funnel used to arrive with a published results page and no
  draft rows, which rendered fine and could not be edited.
- **Duplicate a funnel** - clones each bound page into its own doc rather than sharing.
  The clones start unpublished, matching the copy being a draft.
- **Template library** - the 20 built-ins carry no page content, so nothing to seed. The
  shelf starts from the owner's own migrated pages, via Clone.

## Verify

```bash
npm run verify:result-pages
```

Checks the three rules that fail silently: the UNIQUE binding, the publish mirror, and
the public read path still reading the assessment's own columns.
