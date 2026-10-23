# 23-10-2026 - the follow-up half on the landing page, and the India trip template

Two pieces of work, one commit each half: the public page caught up with what shipped
after it was written, and a twenty-third built-in template for an audience that is not a
business buying a service.

## 1. The landing page

### What was missing

Everything built since roughly mid-October. The page had no mention of contacts, the
appointment calendar, booking, automations, workflow sequences, broadcasts, or payment
collection inside the funnel. The capability grid stopped at "Team roles & access".

### What was added

All of it lives in src/lib/marketing/content.ts, which is the single source for the home
page, the industry pages and the pricing table.

- **Eleven capability cards**, appended to CAPABILITIES under an "After the score"
  comment block.
- **FOLLOW_UP**, a pillar-shaped group that those eleven belong to, rendered by
  Capabilities.tsx after the three pillars through followUpCapabilities().
- **NO_CRM**, and a new section component, NoCrmNeeded.tsx, mounted in Landing.tsx
  directly after Metering.
- One line in the **Gate tier** ("Booking calendar, contacts, automations"). Only the
  Gate tier, because the higher tiers already say "Everything in Gate, plus:" and these
  features are release-gated rather than plan-gated, so they are in every plan.
- One **FAQ**: "Do I still need a CRM alongside this?"
- One **WHY_EXISTS** line: the owner stopped renewing his own CRM from October 2026.
- **DISQUALIFIED_COST** and DisqualifiedCost.tsx, mounted directly under the hero and
  ahead of RealCost. Ten numbered charges in the order they arrive, eight unnumbered ones
  nobody counts, and a closing line that it is an entry problem. Amber rather than green,
  because green is the page's "this is fine" colour and every line there is money
  leaving. Asked for on 23-10-2026, with the first ten points dictated by the owner.
- Two copy fixes in the same pass: the gate line in WHY_EXISTS had the cause after the
  effect ("So the gate was built. The opt-in was happening before anyone knew who it
  was."), and "this month" was replaced by "from October 2026" in both places it
  appeared, since a relative month is wrong the moment the month turns.

### The two decisions worth knowing

**It is not a fourth step.** The mechanism stays "Gate, Score, Signal". A fourth box in
the Mechanism diagram would read as a fourth differentiator and dilute the third one,
which is the only step a competitor cannot also claim. FOLLOW_UP is therefore grouped
like a pillar but is not in PILLARS, so Mechanism.tsx and its heading are untouched.

**Five of the eleven cards carry `soon: true`.** Not because they are unbuilt. They are
built and they are held back by the release catalog in src/lib/features/catalog.ts, where
every key still has `defaultReleased: false`. On a public page "a customer cannot reach
it" and "it does not exist yet" have to read the same way, so they use the same clock
icon AI question generation already uses.

The owner's position on 23-10-2026: the calendar is tested and live; contacts,
automations, workflows and broadcasts release within days once he has tested them end to
end as a tenant from the Apply Gita login.

**When those switches are flipped**, three edits make the page honest again:

1. Delete `soon: true` from the five cards in CAPABILITIES (contacts, automations, the
   meeting link per booking, workflow sequences, broadcasts).
2. Delete the `note` field from NO_CRM and the paragraph that renders it in
   NoCrmNeeded.tsx.
3. Trim the middle sentence of the "Do I still need a CRM alongside this?" answer in
   FAQS, the one that lists what is live today.

## 2. The India trip template

src/features/templates/builtin/india-trip-expectations.json, category **Inbound travel**
(new, inserted before "Platform" so the owner's bucket stays last on the shelf). Adding
the category is what puts the audience on the home page, because WhoItIsFor reads
TEMPLATE_CATEGORIES and verify:templates asserts every category has a built-in behind it.

Shape GATED_ASSESSMENT. Second built-in to carry **both result pages**, so the importer
asks which one a workspace wants. Theme warm_sand on the VSL page.

### Who it is for

An Indian inbound operator selling to a traveller in the US or UK. The respondent is
usually not shopping from scratch: somebody has already quoted them. So the funnel does
not score whether they are ready to buy a trip. It scores **the gap between what they
have been promised and what will actually happen**, which is a diagnosis they cannot get
from the agency that made the promise.

Scored so that **higher means more exposure**, which is the library convention: higher
means more reason to take the call.

### The gate, six questions, three exits

Departure country, per-person budget excluding international flights, how settled the
dates are, who is travelling, where they are in the process, and a free-text question
asking what they were promised and by whom (the manual-review field).

Three named exits rather than one rejection:

| Exit key | Who lands there | Meta event |
| --- | --- | --- |
| wrong_region | Departing outside US, UK, Canada, Ireland | default, content_category wrong_region |
| below_floor | Under $1,500 per person for the India portion | default, content_category below_floor |
| still_reading | No dates decided at all | GateNotYet, content_category not_yet |

below_floor is the one that carries the argument: India can be done for less, but not the
version being described in the quote, and an operator who agrees to all of it at that
price takes the difference back out of the itinerary after the traveller lands.

### The twelve questions

Three categories, four questions each, weight 1, options worth 0 to 3, category bands at
0-39 / 40-69 / 70-100:

1. **What you were promised** - full price in writing with exclusions, named hotels
   versus "3-star or similar", what the itinerary says about shopping stops, and who is
   actually with them each day (licensed guide, or the driver explaining things).
2. **What you are expecting** - how much they want to see, tolerance for hours in a car,
   the standard of room they are picturing, and their plan for food, water and health.
3. **How protected you are** - how the money moved, whether the cancellation terms exist
   in writing, whether anybody verified the operator's registration, and who they ring at
   11pm in Agra.

Result bands 0-40 / 41-59 / 60-75 / 76-100, per the library convention.

### Where the questions came from

Researched on 23-10-2026 rather than invented. The recurring, documented failures:

- Commission shopping stops consuming itinerary time, and guides steering travellers
  into expensive shops after being asked not to. Reported in TourRadar and TripAdvisor
  reviews of Golden Triangle operators, and described as a standard commission
  arrangement per stop.
- Hotel downgrades, and the "your hotel has closed" redirect to a property that pays the
  driver. Also check-in refused on a voucher the traveller is holding.
- A low headline price with the extras arriving later: monument entry, camera fees, air
  conditioning, tips. The standing advice is to get the full price in writing and ask
  explicitly whether shopping stops are included.
- The fake "government tourist office". The real India Tourism office in Delhi is at 88
  Janpath; the ones touts walk visitors to are not.
- Fare overcharging, the broken meter, and prepaid-taxi fraud at the airport.
- Three-day Golden Triangle itineraries sold as unhurried, where most of the complaint is
  road time.
- The credential gap. Ministry of Tourism hotel approval is **voluntary**. Recognition as
  an approved inbound tour operator is a separate scheme, granted for five years on an
  inspection report. IATO active membership requires that recognition plus minimum
  foreign exchange earnings of ₹25 lakh a year. None of these is IATA accreditation, and
  none of them can be confirmed from a badge on a website: the number has to be checked
  with the Ministry or with IATO.
- Redress after the fact is slow: the Ministry of Tourism grievance portal, consumer
  court, and in Delhi a police nodal officer for touts and agents cheating foreign
  tourists. Which is the reason the funnel scores "what can you do after you land"
  as a third of the result.

Sources: [TourRadar operator
reviews](https://www.tourradar.com/o/golden-triangle-tours-of-india), [TripAdvisor,
Golden Triangle](https://www.tripadvisor.com/Attraction_Review-g304551-d10833485-Reviews-Golden_Triangle_Tour_India-New_Delhi_National_Capital_Territory_of_Delhi.html),
[India's steps on tourism and hotel
scams](https://www.hotelmanagement-network.com/news/india-outlines-new-steps-to-tackle-tourism-and-hotel-scams/),
[Delhi tourist scams](https://www.movetodelhi.com/tourist-scams-in-delhi-complete-guide-2026/),
[problems travellers face in India](https://blog.karlrock.com/5-common-problems-travellers-face-in-india/),
[IATO membership](https://iato.in/), [guidelines for recognition as an approved inbound
tour operator](https://www.iato.in/pages/view/25).

## What the owner still has to do

A new built-in arrives **unpublished and un-seeded**. Two steps after the staging deploy,
in this order:

1. Press **Re-seed built-ins** in the templates console. Nothing on a deploy seeds them,
   and the row has to exist before it can be published.
2. Tick **Publish** on "India trip - expectations check". Until that tick, no tenant can
   see it, which is the guarantee that lets template content ship ahead of its review.

Then, separately, the five release switches when the end-to-end testing is done, with the
three landing-page edits listed above.

## 3. What the end-to-end walk found, and what was fixed

The template was walked on staging the same day: all three gate exits, the twelve scored
questions, lead capture, both result pages, the PDF and the JSON export. The scoring
engine came out exact (35 of 36 on a run where one answer was deliberately a 2, banded
CRITICAL at 97%), the gate exits fired with the right copy, and the dates read
DD-MM-YYYY throughout. Six things were wrong. Five are fixed here; the sixth is yours.

### 🔴 The AI statement came from somebody else's prompt

The walk's statement opened with "that took courage", called the trip "an alarming
situation", said the traveller "may be at the edge of something that could shift
everything", pointed at a training video the page did not have, and closed by offering a
US traveller **Tele-MANAS, the Indian mental health helpline**. Nothing malfunctioned:
that is v2-easy-read doing exactly what it says, including its CRISIS_LINE token, which
fires on a CRITICAL band at 90% or more.

The cause is one missing field. `useAiStatement` is part of the transfer shape and the
prompt was not, so a funnel imported from a JSON file arrived with the statement switched
ON and nothing of its own to say, and fell through to the importing tenant's prompt. The
template shelf never had this problem - `features/templates/actions/library.ts` turns the
template's instructions into an AiPromptVersion owned by the importer, and switches the
statement OFF when a template carries none. The file path had no such rule.

Fixed in three places:

- `aiInstructions` added to `assessmentBodyExport`, nullable and optional so every file
  written before today still imports.
- `buildAssessmentBody` resolves the funnel's own AiPromptVersion and exports its text. A
  built-in code id (v1-mentor, v2-easy-read) lives in code, matches no row and exports as
  null on purpose: a built-in is the platform's prompt, not the funnel's to carry into
  somebody else's workspace.
- `bindImportedPrompt` in the transfer importer creates the version and binds it, or,
  when no instructions ride along, sets `useAiStatement` to false. "No statement" is a
  visible absence somebody fixes; "somebody else's statement" is a wrong answer that
  looks like a working feature.

This is why the walk is not evidence against the template itself: imported by file, it
never had its own instructions. Imported from the shelf, it gets them.

### 🔴 The CTA linked to nothing

"Book the 30 minutes" rendered as `href="#"`. Both built-ins with a VSL page ship the
button with an empty url, because a template cannot know the booking slug of the
workspace importing it, and `vsl-result-page.tsx` rendered one anyway.

- The renderer now hides a button with no destination and no booking action.
- Both templates set `bookingCta: true`, so the click records the request, fires the
  `booking_requested` webhook and emails the owner even before a booking page exists.
- `/api/cta/...` with no destination saved now returns the respondent to **their own
  result page** instead of the platform's marketing home, which is where `fallback()`
  used to send somebody who had just asked a travel agency for a call.
- `verify:templates` fails the build if a built-in ever ships a button that goes nowhere
  and records nothing.

### 🔴 Preview on a draft 404ed

The builder offers Preview on a DRAFT - which is the whole point of a preview - and the
publish screen advertises the same link as "Test it yourself". Both 404ed: the only read
the public page had hard-filtered `status: "PUBLISHED"` and `?preview=1` merely bypassed
the cache. `readAssessmentForOwnerPreview` now reads the live row whatever its status,
and the page authorises the viewer (super admin, the owning tenant, or an agency admin
who has entered that workspace) before showing an unpublished one. A published funnel's
preview link is ungated exactly as before, because that funnel is already public.

### 🟡 Three content fixes in the template

- The subhead said "then watch the short walkthrough" while `video.embedCode` is empty.
  The block stays for the owner to fill; the copy no longer promises a video.
- The gate's promise question was optional, which is the one question that makes this
  funnel worth running. Reworded to "What have you been promised so far, and by whom? If
  nobody has quoted you yet, say so." and made required, so somebody who has not been
  quoted can still answer it honestly.
- `estimatedMinutes` 4 to 6. Six gate questions and twelve scored ones is not four
  minutes.

### 🟡 Left alone, deliberately

The three gate exits have no button. The renderer already hides a button with no url, so
this is a content choice rather than a bug, and there is nowhere honest to send somebody
we have just told to book with an operator closer to home. The category table on the
scored page shows a blurred `88 / 100` for every row: that is the designed placeholder
("the real score is never sent"), and the band words beside it are the real ones.

### 🔴 Still yours: the template is on nobody's shelf

/w/templates and the dashboard shelf jump straight from RECRUITERS to PLATFORM. Visibility
needs `ownerTenantId` null AND `published` AND `reviewStatus` APPROVED; the boot seed sets
the other two on every deploy, so the Publish tick has not landed **on this database**.
Most likely it was ticked on production, where the built-in file does not exist yet. Tick
it on staging, at /admin/templates, and the audience appears.

## 4. What re-walking the fixes found

The funnel was imported again from a file carrying its own `aiInstructions` and walked
end to end on staging (36 of 36, 100%, CRITICAL - the worst answer on all twelve). Three
fixes proved out and one new fault surfaced, which is what a second walk is for.

**🟢 The prompt now travels.** The statement named the single biggest gap (the unnamed
hotels), costed it out on the day it surfaces ("you will lose your first morning...
ringing numbers that do not answer"), kept British spelling, never mentioned a video or a
price, and closed on half an hour with somebody who runs these trips. That is this
template's instructions, where the same run on the same answers previously produced a
coaching intervention.

**🟢 The draft preview works, and only for the right people.** /a/india-trip-fixcheck
rendered for the signed-in owner while the funnel was still a DRAFT; the same URL fetched
anonymously returns **404**, and a published funnel's preview link still returns 200.

**🟢 The required gate question is live** and reads without the "(optional)" marker.

**🔴 The crisis helpline was still being appended.** The statement ended with "If you ever
feel you can't carry it alone right now... Tele-MANAS... 14416" - a mental health helpline
under a paragraph about hotel vouchers, offered to a traveller in the United States.

`applyCrisisLine` had an unconditional safety net: a CRITICAL result at 90% or more with
no `{{CRISIS_LINE}}` token got the line appended. Only the BUILT-IN prompts know that
token exists - a tenant instruction (V3+) version is the owner's whole system prompt, so
it never emits one, and the net therefore fired on every top-band result in every funnel
in the product, whatever it was about.

The line now follows the prompt that asked for it: `appendIfMissing` defaults to true, and
the generator passes `!version.minimal`. A built-in keeps its net; an owner who wants the
line writes the token into their own instructions and gets it replaced verbatim. The band
and percentage rule is untouched, and `verify:ai` now covers both directions.

**🟡 One cosmetic miss from the first pass.** `estimatedMinutes` was 4 and I corrected it
to 6, but the hero line a respondent actually reads is the template's own `eyebrow`
string, which still said "12 questions, 4 minutes". It now reads "18 questions, 6
minutes", which is what six gate questions plus twelve scored ones actually is.

**🟡 Pre-existing and left alone:** `verify:ai` fails one assertion, `[v3-bridge] sets
200-280 words`. It fails on the committed tree too (checked by stashing), the script is
not part of the build chain, and the assertion is a stale invariant about a prompt that
deliberately differs. Worth deleting or rewriting, but not inside this change.
