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

---

## The platform shelf (same day, follow-up)

The owner can publish a result page or VSL page for every workspace to import, the same
way the 20 assessment templates work.

Four fields on ResultPageDoc: `shelfListed`, `shelfCategory`, `shelfSummary`,
`shelfOrder` (migration `20261014000000_result_page_shelf`). `shelfListed` is NOT
`published` - `published` means "this page has a live snapshot on its funnel", listed
means "other workspaces may copy it". A shelf page is normally unpublished and bound to
nothing, because what a tenant imports is the draft.

**Three conditions to list a page**, each one a different way to get it wrong:

1. The caller is the platform owner. Listing puts content on the first screen of every
   workspace on the install.
2. The page is platform-owned. A tenant's page is theirs, and publishing it would hand
   their copy, headline and video to every other customer. The owner's screen hides the
   controls while they are inside a customer workspace, and the action checks again.
3. The page is bound to nothing. A template is a starting point; copies of a live page
   would multiply somebody's booking inbox across the install. Clone the funnel's page
   and publish the clone.

**Reading the shelf is the one cross-workspace read in the feature.** `listShelfDocs`
and `shelfDocForImport` are scoped to the platform's own rows (Platform tenant, plus the
legacy `null` owner), listed only, and unbound only. `includeUnlisted` exists for the
owner reviewing a page before shelving it, nobody else.

**Import copies, always.** A tenant gets their own doc with their own slug, unpublished
and unbound, provenance in `sourceSlug`. Nothing ever binds a tenant's funnel to a
platform row - the binding is 1:1, so crossing a workspace with it would mean the
owner's edit rewriting a customer's live page. The shelf's own text (category, summary)
is not carried: it describes the listing, not the page.

**Screens.** /w/result-pages shows "Start from a template" above the workspace's own
pages, grouped by category, with Import. /admin/result-pages shows the platform library
with per-row "Publish to shelf" / "Remove from shelf" and "Shelf text", plus a line
saying how many pages are on the shelf.

After importing, the page is an ordinary free page in that workspace, so it appears in
the builder's step 12 / 13 dropdown like any other.
