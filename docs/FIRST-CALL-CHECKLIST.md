# The first 30 minutes

The founders offer page is a marketing page. It names the problem, says how Assess360
solves it, and puts a deadline on it. Everything operational happens here instead, on
this call, which is why nothing in this document appears anywhere on the site.

Written 24-10-2026, against the offer as it is live on staging. If the offer page
changes, section 8 changes with it.

---

## 1. The four that block everything

Nothing can be built until these four exist. The gate, the questions, the scoring bands
and the result page are all written against the offer and its price, so without them
there is nothing to qualify anyone for.

- [ ] **The product.** What it actually is, in their words, and what it is not.
- [ ] **The offer.** What a buyer gets, and the promise attached to it.
- [ ] **The price.** The number. Fixed, or quoted per client?
- [ ] **How they onboard a client after the close.** What happens between the yes and
      the delivery. This is what the result page and the booking flow have to lead into.

These four are also what the pre-call onboarding form should collect, so that this call
confirms them instead of discovering them. Until that form exists, ask them here.

---

## 2. Who gets qualified out, in their own words

This is the gate, and it is the one part that cannot come from a template. A gate built
from someone else's rejects is what makes a funnel look like every other form.

- [ ] The person they do not want, described by them, not by us.
- [ ] The last three leads that wasted their time, and what was wrong with each one.
- [ ] The single answer that should end the questionnaire on the spot.
- [ ] Anyone who should be waitlisted rather than turned away.

---

## 3. The accounts, and the queue that is not ours

Every one of these, missing, is a day off a clock that does not stop.

- [ ] Ad account id.
- [ ] Business manager, verified. If it is not, they start it today. That queue is
      Meta's, not ours, and their slot is not held while it sits in it.
- [ ] Pixel id.
- [ ] Conversions API token.
- [ ] Spend running now, at least ₹1,000 a day, for at least the last 30 days.
- [ ] Their current cost per lead, so there is a before number to measure against.

---

## 4. The tools around it

- [ ] A product landing page.
- [ ] An opt-in form.
- [ ] A calendar.
- [ ] A video call tool for their sales calls.
- [ ] A custom domain, if they want the funnel on their own.

---

## 5. What they do before the ads run

The page says none of this on purpose. A reader who learns on the sales page that they
need new creative will wait until they feel ready, and the trial is the only thing that
makes anyone move. So it is said here, once they are in.

- [ ] **What the ad should point at:** take the assessment, find your state. Say it on
      this call and nowhere else.
- [ ] **The creative is theirs.** Copy, images, video. Confirm who makes it: them, or
      their agency.
- [ ] **When it will be ready.** Day 4 is launch day and the assessment is ready on day
      3. A late video moves day 4, and the days it costs are theirs.
- [ ] **If there is an agency, the brief goes to them today.** Not on day 3.
- [ ] Set the reminder. They will need chasing, and chasing them is cheaper than
      explaining a dead week on day 10.

---

## 6. What not to say on this call

- [ ] **Not the 30 days.** It is a day 13 lever. Offered now, it is permission to go
      slow, and the whole point of the deadline is that it removes that permission.
- [ ] **Never a count of calls.** It is support. However many it takes, it is support.
- [ ] **No review, not asked and not promised.** They will offer one when they see
      their own numbers.
- [ ] **Do not take on their work.** Not the creative, not the ad spend, not calling
      their leads. We read what the answers are telling us and we say what should
      change. That is the line, and it holds without being announced.

---

## 7. The day 13 check

Any one of these triggers the extension:

- [ ] No close.
- [ ] No qualified leads.
- [ ] Time they lost to a bug that took us a while to fix.

Then offer the extra 30 days, and say why: nobody should be judging the tool on too
little data. Also on day 13:

- [ ] Their before and after numbers, read together.
- [ ] If there was a close, ask for the review. Video, Trustpilot, Google.

---

## 8. What the page already promises

Do not contradict any of this on the call. It is live, and they have read it.

| The page says | Where |
| --- | --- |
| 14 days, calendar days, and the clock does not pause | clockNote |
| Day 1 setup, about half an hour, on a call | stages |
| Days 2 to 3 the assessment, tuned from the closest template | stages |
| Day 4 ads launch, optimising on the gate-pass event | stages |
| Days 5 to 7 traffic, days 8 to 10 bookings, days 11 to 14 their sales calls | stages |
| The build is free, and the build means the setup, named part by part | cost |
| No card is taken, nothing charges, nothing to cancel | cost |
| Support covers the build and the ad account it is connected to | finePrint |
| Theirs: running the ads, calling leads, taking the sales calls | scope |
| Expectations worked out on day 4 from their own cost per click, judged on day 7 | stages |
| Asked in return: 100 visitors, and their numbers before and after | askInReturn |
| First 20 only | promise |

Every one of those lines lives in [offers.ts](src/lib/marketing/offers.ts), under the
field named in the right column.
