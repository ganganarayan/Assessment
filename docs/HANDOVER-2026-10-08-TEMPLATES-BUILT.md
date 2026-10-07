# Handover: 2026-10-08 — the Template Library, built

Supersedes section 4 of **docs/HANDOVER-2026-10-07-TEMPLATES.md**. That document is the
design; this one is what shipped, where it lives, and what is left.

All six phases from the agreed order are built and on **staging**:

| | Phase | Commit |
|---|---|---|
| 🟢 | 1. Template table + migration | a11d9dd |
| 🟢 | 2. Super-admin Templates screen with the publish checkbox | a11d9dd |
| 🟢 | 3. Tenant dashboard section + /w/templates + Import | a11d9dd |
| 🟢 | 4. Save as template / Contribute, with the pending-review flow | a11d9dd |
| 🟢 | 5. The 8 authored templates, seeded | a11d9dd |
| 🟢 | 6. Publish lock + "I don't use Meta" + the policy line | b686028 |

Nothing is on **main**. Promote only when told.

---

## 1. Two corrections to the design document

- 🟡 **There is no `uniqueSlug()`** in features/assessment/transfer/import.ts. The real
  function is **generateCopySlug(base, taken)**, and it checks the live unique index. The
  guarantee the design relied on is real; only the name in the document was wrong.
- 🟡 **The "5 gate + 10 assessment" rule cannot hold for every template**, because the
  three required shapes contradict it. A screening-only funnel has no assessment, and an
  ungated one has no gate. What shipped:
  - **GATED_ASSESSMENT** (Coaches, B2B SaaS, Agencies, Clinics): 5 gate + 10 scored
  - **UNGATED_ASSESSMENT** (Healers, Consultants): 0 gate + 10 scored
  - **GATE_ONLY** (Astrologers, Real estate): 5 gate + 0 scored

  Say so if you would rather the gate-only pair carried ten questions nobody ever reaches,
  and they will be added.

---

## 2. Where everything is

```
prisma/migrations/20261008090000_template_library/   the table, two enums, two FKs
prisma/migrations/20261008100000_meta_not_used/      AppSetting.metaNotUsed
src/features/templates/
  schema.ts          zod: the template document, the categories, the shape labels
  data.ts            every read + the derived visibility (mine/canRemove/importable)
  import.ts          the engine: template row -> a real DRAFT assessment
  seed.ts            upsert the built-ins by slug
  types.ts           return shapes ("use server" files may export async fns ONLY)
  builtin/*.json     the 8 templates, + index.ts listing them
  actions/
    templates.ts     super-admin: publish, order, wording, approve, reject, delete, re-seed
    library.ts       tenant: import, save as template, delete own
  components/
    template-library.tsx   the shelf (dashboard + /w/templates, one component)
    templates-console.tsx  the owner's review + shelf screen
    save-as-template.tsx   the builder button
src/lib/meta/publish-lock.ts   metaPublishBlock()
src/app/admin/templates/page.tsx
src/app/w/templates/page.tsx
scripts/verify-templates.ts    npm run verify:templates
scripts/seed-templates.ts      npm run seed:templates   (add -- --public from a laptop)
```

---

## 3. The decisions worth not re-litigating

**`body` IS the portable transfer shape** (`assessmentBodyExport`). This is why the build
was small. Import reuses **assessmentCreateData** from transfer/import.ts; "Save as
template" reuses **buildAssessmentBody** from transfer/export.ts. Both were made exported
for this and are otherwise unchanged. A field added to the export format arrives in
templates for free — and a second mapping written here would drop fields silently, which
is exactly how the old narrower export lost thirty-four settings.

**Visibility is derived, never stored as a mode.**

| Who sees it | Condition |
|---|---|
| any workspace (the library) | ownerTenantId IS NULL AND published AND APPROVED |
| one workspace (private) | ownerTenantId = that tenant |
| its contributor, at every stage | contributorTenantId = that tenant |
| the owner's console | everything, pending first |

A mode flag would be one value to get wrong, and getting it wrong means a workspace's
own questions in front of every other tenant. data.ts computes **mine**, **canRemove** and
**importable** per row so no component reconstructs the rule in JSX.

A contributor keeps seeing their own row. The first cut did not, and the effect was that
pressing Contribute made the template vanish: no status, no way to withdraw it, nothing to
carry the reviewer's reply back.

**Import forces four things**, and each is a mistake that would otherwise be made once per
import: DRAFT, a globally unique slug, `fireMetaCapi` off (the master switch — the
template's per-event selection is kept for when they turn it on), and an **AiPromptVersion
created for the importing tenant** from the template's instruction TEXT.

> 🔴 That last one is load-bearing. A tenant cannot read the platform's built-in prompts
> (lib/ai/scope.ts: a built-in id resolves to null for anyone else), so carrying a prompt
> **id** would import an assessment that generates nothing and says nothing about why. The
> same rule runs backwards in "Save as template": instructions are resolved only from an
> AiPromptVersion row owned by that tenant, so contributing can never leak the owner's
> built-ins into the library.

**Built-ins live in git and are seeded at boot.** railway.json runs
`(npm run seed:templates || true)` between migrate and start — fail-soft, so a malformed
template can never stop the app. Verified on staging: the boot seed had already created all
eight before a manual run was attempted, which reported "0 created, 8 updated".

> A re-seed **never** touches `published` or `displayOrder`. Those are the owner's shelf
> decisions, and a deploy that silently un-published the library would take out the one
> screen a new customer sees first. Everything else is overwritten from the file, because
> that is what versioning the content is for. A **new** built-in arrives published.

**The reward uses the existing grant mechanism.** Approving returns who contributed, how
many they have had accepted this month, and where their credit period currently ends; the
console then calls **setTenantPlanGrant**, the same action the Platform console uses. One
place where access is decided. The cap is one accepted contribution per workspace per
calendar month, implemented as a **warning with an "Approve anyway" button**, not a wall —
the rule is there to stop credit farming, not to refuse a second good template.

**The publish lock** is resolved by `metaPublishBlock(tenantId)` and enforced in
`setAssessmentStatus` beside the parked guard. Publish only, never unpublish; super admins
exempt; the warning names the missing field. `AppSetting.metaNotUsed` is the escape hatch
and it exists because "no pixel" has two meanings — "we do not advertise on Meta" is fine,
"we have not set it up yet" is the mistake — and nothing in the data separates them.

---

## 4. Testing it on staging

The library is seeded but every built-in is **published** already, so it should be visible
immediately.

1. `/admin/templates` — eight rows, each Published, with Built-in badges. Re-seed built-ins
   reports "0 created, 8 updated".
2. Enter a workspace, open `/w/dashboard` — the Templates panel sits above the video, open.
3. Import one. It lands as a DRAFT with a unique slug; if the template carried AI
   instructions, the confirmation names the version it created for that workspace.
4. In that draft, press **Publish** with the workspace's pixel fields blank. Expect red
   text naming what is missing and a disabled button. Tick "We don't use Meta" in Settings
   and the button comes back.
5. In the builder, **Save as template** → Contribute. It leaves the library, appears on
   `/w/templates` as "Awaiting review", and shows up on `/admin/templates` as pending.
6. Approve it. The credit panel opens with their current date filled in. Approve a second
   one from the same workspace in the same month and expect the cap warning first.

🟡 **Not yet exercised by anybody**: the contribute → approve → credit path end to end, and
an import on a workspace that is at its plan cap.

---

## 5. Still open

- Promote to main when told. Nothing else is waiting.
- Paste the getting-started steps into super-admin Settings; that panel is still empty.
- Delete NEXT_PUBLIC_META_PIXEL_ID, META_CAPI_ACCESS_TOKEN and META_DATASET_ID from
  Railway (carried over from the 10-07 handover, still true).
- `railway run npx tsx scripts/reset-result-views.ts LB636CXGA4B9K4CL` clears 3 views from
  diagnostic curls (carried over, still true).
- The publish lock applies to tenants only. If the owner wants it on their own platform
  assessments too, the exemption to remove is `!scope.isSuper` in setAssessmentStatus.
