# The owner's course corrections

Each of these was a correction, most of them given more than once. They are settled decisions,
not style questions. Read this before proposing anything that looks like a naming, scope,
formatting or product decision.

## How I work

**Auto-push to staging, never ask.** (10-06-2026, reinforced 07-09-2026 and 26-09-2026)
Anything built or changed goes to staging as the final step. No "want me to push?" prompt.
Applies to every session, cloud or local, with no exemptions. main is touched only on their
explicit word.

**No local builds at all.** Local runtime proves nothing because the Railway environment
differs. Do not decide a change is a "runtime no-op" and skip the push. Consistency over
cleverness.

**Always check the staging build.** "always check staging build." A green local result has
repeatedly masked a Railway-only failure.

**No em dash or en dash, anywhere.** (02-10-2026, repeated 09-10-2026) The third time came with
evidence: zero in shipped code, zero in 21 commit messages, 373 across the memory files and
chat replies full of them. So the rule was being applied to code and dropped everywhere that
feels like conversation. The guard is to scan the REPLY before sending it and any Markdown
before writing it.

**Every human-read timestamp is DD-MM-YYYY.** (repeated with visible irritation on 15-10-2026)
A bare `toLocaleString()` takes the runtime's locale, which on Railway is US order, and the
owner reads that as a defect every time. Use `formatIST`.

**Anything done by hand is a numbered step list, nothing else.** (27-10-2026) Every step names
the exact URL, the exact sidebar item, the exact button label, the exact field and the exact
value, ending with what success looks like on screen. No explanation wrapped around it, no "you
could also". They were having to hunt through dashboards and paste screenshots asking "is this
right", which is the instruction failing, not them. Read the real UI labels out of the code
first, never from memory. Pick the value for them rather than offering choices.

**Ask the deciding question instead of concluding.** (15-10-2026, standing, given more than
once) Do not present a conclusion resting on an unverified assumption about what they did.
Each confident wrong answer sends them looking in the wrong place.

**Run the failure pre-mortem BEFORE shipping anything money-critical.** "all the capi changes
you are doing now, should have been done earlier, so that i would save time and money." Propose
the solution, ask what if this fails, give the fallback, ask what if THAT fails, repeat, and
ship the fallbacks in the same change. Then hand them a brief sequential failure-to-fallback
chain, a few lines per step, because reading long documents also costs them time.

**Be token-thrifty and report tokens.** End every reply with a footer: this-turn in and out
(estimated), cumulative, context-window fullness, and a continue-versus-new-chat nudge. Before
any task or phase, show a tentative estimate, proceed without asking, then log estimate versus
actual (gut estimates run about 2 to 3 times the objective counter).

**Do not poll deploys continuously.** Record each build's duration and wait roughly the last
duration plus ten seconds before the first check. Most of the build window should have zero polls.

**Status dots, because they read red and orange as danger.** 🟢 OK or safe, 🟡 needs attention,
🔴 dangerous or blocked. Keep the dots. And avoid backticks in prose for branch names, file
paths, hashes and commands, since the chat theme renders them red.

## Architecture and scope

**Parity is the default.** (30-09-2026) "any feature that is there in the super admin should be
there in the tenant also... unless I mention the scope separately." They are becoming a tenant
themselves, so anything reachable only at /admin is capability they lose the moment they operate
as one. Do not assume a screen is admin-only because it currently lives under /admin.

**Env vars hold only what the app needs to launch.** (30-09-2026) "no tenant settings to be done
in railway env vars. env vars only hold those required to launch the app and rest everything goes
to settings inside the app scoped to each tenants separately." Extended to PLATFORM config on
13-10-2026: "this does not exist. i had categorically told that, nothing should be in env vars,
everything in settings, then where this comes from, is this id in code? remove it and point to
settings razorpay keys. do not assume." They were right, none of the six plan-id vars was set
anywhere, and the variable existed only as a way for a published price and a charged price to
disagree in silence.

**Owner-facing descriptions, never code.** The owner does not read code or diffs. Describe
changes as what is different in the app and what they need to click, never as files, lines or
patches.

**One switch for all tenants, never per tenant.** (20-10-2026) "one switch means one answer to is
this live." Platform and internal tenants are exempt so they can test as a tenant, and holding a
feature back is a kill switch that deletes nothing.

**A release switch is the owner's TESTING gate, not a statement about the product.** (27-10-2026)
The features exist, a new customer does not touch the follow-up half on day one, and he releases
ahead of anybody asking. So a switch being off in production is NOT grounds to cut a built
feature from a marketing page or badge it "Coming soon". A Gate tier bullet was cut and five
calendar cards were badged on that reasoning, and it was reverted the same day. `soon` marks what
is in FINAL TESTING, which is his call.

**Nomenclature.** (13-10-2026 and 15-10-2026) Internal: super admin, tenant, agency admin, agency
tenant. Public: "client workspaces". Both are right in their own place, do not "fix" one into the
other, that round trip has been made twice in one session in both directions. "Sub-account" is
wrong everywhere, pushed back on three times.

**The unit is one workspace.** (13-10-2026) Not pooled quotas. A seat is a USER inside one
workspace, it has never meant a workspace.

**Tenants never see an API key field.** AI is a platform capability: the owner holds the provider
keys and binds the model per plan as data, never a constant in code. Asking a customer for a key
reads as a wrapper and hands them an argument against the response caps.

**Finishing an assessment and signing in are separate events.** Never auto-navigate a funnel run
into an authenticated area.

**Buttons: green with white text for primary actions.** "Button color all across the app you have
kept green with white font, that's what i meant to keep." Reserve outline and ghost for genuinely
secondary actions and never invent custom button colours.

**Autosave stays builder-only.** (06-10-2026) "this is the longest page ever." The app-wide sweep
is parked, not pending. Do not start it unprompted. Never adopt it on the respondent funnel,
sign-in, sign-up, forgot-password or reset-password.

**Desktop-only workflow canvas.** The one agreed exception to the project's mobile-first rule,
because a drag canvas on a phone is bad. The phone keeps the list view.

## Product calls

**Withhold the insight in the free AI statement.** The message must make the reader feel deeply
understood but must NOT reveal which answers form the pattern, the cause or the roadmap. Use open
loops. That withheld interpretation is exactly what the paid consultation sells; revealing it
kills the booking. When tuning AI output, protect curiosity over completeness.

**Go by the actual calculation, drop the bands from the respondent page.** (14-08-2026)
"eliminate showing the bands altogether, calculation itself makes things obvious." The three
band-gated closings were replaced by one universal "Talk it through" plus the booking calendar
for every respondent: the math no longer pre-rejects on the lead's behalf. The band is still
computed and stored for internal triage.

**Show the funnel math staged and obvious.** They explicitly want the arithmetic visible on the
prospect-facing page, because showing "you're taking home nothing" in plain arithmetic drives the
booking without a sales call.

**Whole patients only.** "1.4 person is not possible, so make it 1" and "when you say 1 patient,
it is 1 Lakh". Every summary figure derives from the ROUNDED count. They were told this
understates today's revenue when the count rounds down, and chose it anyway.

**Provide fields for the actual number.** "I am still not convinced... your selection is just
taking the average of the range... provide fields to input the actual number... if blank, mention
(assumed average in the range)."

**Disqualified people see NO result.** (24-09-2026) Phase 2 of the gate, an ephemeral scorer for
disqualified visitors, is CANCELLED by decision. Final design.

**The gate scores nothing.** (09-10-2026) Every gate option's points are 0. The gate decides who
gets assessed, the assessment decides the number. Merging them was the mistake, and it had
produced real defects three times (a Master's scoring below a final-year Bachelor's).

**Higher score means a higher reason to call.** One direction across all built-in templates.
"high score = high intent, high problem, highest reason to call."

**Waitlisted is not rejected.** A waitlist answer completes the gate and opts the person in,
because a fit whose only problem is a date is the most valuable prospect in the funnel.

**GateWaitlisted at the gate and nothing after.** (11-10-2026) They opted in, so the CRM holds
them with full contact details and that is where the next-cycle list is built. Meta does not need
a copy.

**Cancelling must never be gated on answering.** The exit survey auto-opens AFTER the
cancellation is booked, with an escape. Forced-survey-before-cancel is a dark pattern under the
CCPA guidelines and fails the FTC negative-option rule.

**The founders offer page is marketing only.** Five things never appear on it: the extra 30 days
of support, that the ads should point at the assessment, any count of calls, that the client does
their own creative and calling, and reviews. Each omission is a conversion leak with a mechanism.
The operational half lives in docs/FIRST-CALL-CHECKLIST.md.

**Watch completion is never forced.** The result-page button opens gate 2 directly. "I'll watch
before meeting him" is a gate-2 question option they add in the builder. No code gates on watch time.

**CRM stays singleton-only.** (02-09-2026) Not in use right now and stable, so keep it on super
admin and do not delete. Revisit if a tenant needs it.

**Razorpay is the only native gateway.** They will not build more. Lane 3 (an external gateway
hand-off) proves return, never payment.

**Templates carry USD first with the INR band in brackets**, and keep India-specific mechanics
(pincode, HUF, CTC, lakh). Comparison pages get everything except the reviews block.

**The prompt-based page builder is a FEATURE inside Assess360, not a product.** (19-10-2026)
Costed as a standalone SaaS and rejected: the category is saturated and every registrar bundles
one free. The headline changes with it: the product is a "lead qualification engine".

**Lifecycle planning rides the in-app heartbeat, not a cron.** (24-10-2026) They pushed back on a
five-minute cron, so planning fires on the first beat at or after 06:00 IST.

**No vendor-written reviews, no account creation, no clicking submit.** (distribution work) The
agent fills the form, the owner verifies and submits, because getting products delisted is
unrecoverable. After the G2 suspension on 19-10-2026: business email only, never a free domain,
and no browser automation against G2, Capterra, GetApp or Software Advice.
