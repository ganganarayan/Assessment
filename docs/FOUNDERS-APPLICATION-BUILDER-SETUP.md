# The founders application, built in the builder

Date: 18-10-2026

The application behind the Apply button on /offers is **not code**. It is an assessment
on the Platform tenant, built in the builder, because everything it needs already
exists there. This sheet is the exact configuration.

## Why it is built rather than coded

The problem it has to solve: the application asks for numbers people do not have in
front of them. A gate that turns those people away loses them twice, because
GateDisqualified is what populates the Meta exclusion audience, so a real buyer who
only needed ten minutes to open Ads Manager would never see the ads again.

Three things in the engine settle that:

- **fireDisqualifiedEvent is per exit**, not per gate. Switch it off on an exit and the
  person leaves through a named door and Meta is told nothing.
- **Exit mode OPTIN** is not a rejection: the person is sent to the lead form, their
  details are captured, the lead webhook fires, and the exit's own copy is shown as the
  thank you.
- **Exit mode CONTINUE** passes them through to the whole assessment.

So the first screen is one question with five answers and five doors. Nobody is told
no, every door captures the lead, and no door touches the exclusion audience.

## Screen 1: the router question

Put the required-data list in the gate question's own intro text, as agreed: this is
what onboarding needs, and anything missing means it does not happen. Then one choice
question. **Nothing on this screen asks for a number**, which is the point: there is
nothing to go and look up, so there is nothing to bounce off.

| Answer | disqualifies | exit | Mode | Fire disqualified event |
| --- | --- | --- | --- | --- |
| I have all of this and I can fill it in now | no | passes the gate | n/a | nothing fires |
| I have it, I need to open my ad account for the numbers | yes | Needs numbers | OPTIN | **off** |
| My agency runs my ads, I will connect them to you | yes | Agency | OPTIN | **off** |
| I am not ready for ad spend yet, I want the software | yes | Software only | OPTIN | **off** |
| Some of these terms are new to me | yes | Explain first | OPTIN | **off** |

Four of them are marked disqualifying only so they can carry their own exit key. That
is what `exitKey` is for, and it is only read when `disqualifies` is true.

In the builder: the mode dropdown on each exit reads "Ask for their details, then show
it" for OPTIN and "Ask for their details, then let them take the assessment" for
CONTINUE. The disqualified-event checkbox is in the same panel. Give each exit a
`contentCategory` so the four can be told apart later without four event names.

### What each door says and does

- **Needs numbers.** Thank them, tell them the link is in their email, and that the
  Conversions API token is not something to paste into a form: say yes to having it
  saved and bring it to the call. The opt-in email carries the link to screen 2.
- **Agency.** Thank them, ask them to forward the same link to whoever runs the ads.
- **Software only.** This is a real customer, not a reject. Send them to the trial.
- **Explain first.** Send them to /answers, then offer the call.

The email is the nurture opt-in sender: one email and one WhatsApp, fired once on
opt-in, per-tenant credentials, configured at /admin/nurture. Paste the screen 2 URL
into the template body. No code.

## Screen 2: the numbers

The eighteen fields, as questions on the assessment itself rather than as a coded form.
Reached straight away by the first answer, or from the emailed link by the second and
third.

Already asked by the old form: business, website, email, WhatsApp, what they sell, what
it costs, traffic source, leads a month, who is a bad lead, calendar link.

To add: daily ad spend now, how long they have been running, current cost per lead,
cost per booked call, what share of leads are wrong fit, average deal value, close rate
on a qualified call, Pixel ID, business manager verified yes or no, and the CAPI token
as a **yes box only**, never a text field.

## The result page: self-onboarding, with the call as a choice

Two CTA blocks on the result page:

1. **Set it up myself**, to the self-onboarding sequence. This is the default and it is
   the one that saves time.
2. **Book the 30 minutes**, which goes through /api/cta so the click is recorded against
   the submission and the CRM fires. You find out who chose the call without being in
   the loop for the ones who did not.

## Where the rows land

The assessment belongs to the **Platform tenant**, so the rows are yours:

- /admin/submissions for completed applications.
- /admin/gate-qualified for the ones who passed and stopped.
- Leads for the four OPTIN doors.

The applicant has no workspace at this point, so nothing lands in theirs.

## The one thing that retires

/admin/build-requests and the DfyRequest table. Its NEW, CONTACTED, BUILT, DECLINED
status column has no equivalent in Submissions. The rows survive, the pipeline column
does not. Nothing has been deleted, so this can wait until the new path has run.

## After it exists

Point the Apply button at it: `applyHref` in [offers.ts](../src/lib/marketing/offers.ts),
currently /build. One line.

Then optimise the ads on **GatePassed**, which fires the instant the gate clears. Not
page views, not link clicks, not a traffic objective. GateDisqualified must never be an
optimisation target, and with the event off on all four doors it will not have the
volume to become one by accident.
