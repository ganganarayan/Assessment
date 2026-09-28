# Handover — state, open items, working rules

Written 28 Sep 2026 at the end of a cloud session, so the next session (local) starts
with the context instead of rediscovering it. Update it as things land; delete the
parts that stop being true.

---

## 1. Working rules (agreed with the owner)

- **Two branches only: `staging` and `main`.** No feature branches, no pull requests.
- **Everything is committed straight to `staging`.** Railway auto-deploys `staging` to
  the `orbitq-assess` environment.
- **`main` is production, and only on an explicit yes.** Never promote without being asked.
- **The owner does not read code or diffs.** Describe changes as what is different in
  the app and what they need to click — never as files, lines or patches.
- Run `npm run typecheck` and the `verify:*` scripts before committing. Do not run a
  local `npm run build`; the Railway build is the check (see CLAUDE.md).

---

## 2. Where things stand

**Production (`main`)** has the funnel-reporting fixes: SaaS CAPI sends are logged,
Signups counts accounts rather than tenants, gate rejections are recorded, and the
`GateDisqualified` event no longer re-fires on every revisit.

**Staging (`staging`) is ahead of production** by the booking-CTA feature. It is
deployed and green on `orbitq-assess`, but **not** in production — it is waiting on the
owner's yes.

### The booking CTA needs turning on before it does anything

It is opt-in per button, so until these two steps are done the button behaves exactly as
it always did:

1. VSL Result Page builder → the booking button → tick **"This button requests a
   booking"** and fill in **"Email me at"**.
2. Webhooks page → add one webhook, trigger **"Booking requested (result-page CTA)"**,
   pointing at the CRM.

Then a click on that button records who clicked (a **Booking** column appears in
Submissions), fires the CRM webhook so the CRM sends the visitor's confirmation email and
WhatsApp from the owner's own sending address, and emails the owner with the person's
name, email, phone and a link to their full result page. Both the webhook and the email
retry on a backoff if they fail — a booking request is never dropped silently. Test on a
real result page, not the admin preview: preview deliberately records nothing.

---

## 3. Open items

### Owner locked out of staging — recovery exists, use it

Sign-in to `orbitq-assess` fails with "Invalid email or password". **The recovery tooling
is already built** (added 21 Sep after a production lockout that cost a day):

```bash
railway link      # Assessment → orbitq-assess
railway status    # CONFIRM orbitq-assess, not production
railway run npx tsx scripts/reset-user-password.ts <owner-email> "<new password>"
```

This repairs four of the five lockout causes at once: wrong or unreadable password, a
missing credential record, a stuck "must change password" / unverified-email flag, and —
the actual cause of the 21 Sep production lockout — **the owner account being demoted**,
which it reverses by restoring SUPER_ADMIN and clearing the tenant.

Read its output, it says which problem it was:
- `… (restored to SUPER_ADMIN)` → it was the demotion again
- `Password reset for …` → it was a credential problem
- `No user with that email.` → the account is not in staging's database at all; sign up
  with the owner email instead, which grants SUPER_ADMIN automatically

There is also an HTTP route (`POST /api/admin/recover`, Bearer `ADMIN_RECOVERY_SECRET`)
for when the CLI is not available; the secret must be set in that environment first.

### Proposed but NOT done: make the seed bootstrap the real owner

`prisma/seed.ts` hardcodes `owner@example.com`. It has never created the owner's actual
account, which is why a fresh database comes up with a login nobody has the password to.
**Changing the seed to bootstrap whatever `PLATFORM_OWNER_EMAIL` is set to would remove
this whole failure class.** The owner was offered this and has not yet said go.

### Unanswered: is a Conversions API Gateway mirroring browser events?

Meta shows **server-side** `GateDisqualified` events, but this codebase only ever fires
that event from the browser. Something outside the app is mirroring browser events into
the server channel — most likely a CAPI Gateway on pixel `1129238316012161`. Worth
confirming in Events Manager, because it also means the app's own `CompleteRegistration`
CAPI send is a third copy of an event Meta already receives twice.

### The gate is rejecting most ad traffic

Separate from any bug: on 27 Sep the qualification gate turned away far more people than
it let through. The old event counts overstated it (they re-fired per visit), so the new
**"Turned away by gate"** tile is the first honest number. Once real traffic has passed
through it, judge whether the qualifying criteria are too tight. This is where the
registrations went — a content decision, not a code one.

---

## 4. Facts worth not rediscovering

- **The "0 registrations vs Meta's 4–5" was never a CAPI bug.** Every
  `CompleteRegistration` fires on `assess.applygitawisdom.com/` — they are *assessment
  opt-ins*, and they were being compared against the *Assess360 SaaS signup* count, which
  genuinely is 0. Two different funnels sharing one standard event name. `CapiLog.scope`
  now separates them.
- **Seeing server-side events in Meta does not prove the app's CAPI fired** (see the
  Gateway item above).
- **A gate rejection is permanent by design.** The lockout is a per-browser flag; losing
  it to a cleared cookie or a new device is accepted, since a non-opt-in leaves no PII to
  match on. The exclusion audience is the real mechanism, and `GateDisqualified` re-fires
  after 60 days to keep membership alive inside Meta's 180-day retention.
- **`npx prisma format` reformats the entire schema file.** It produced a 455-line diff
  for a four-model change. Do not run it casually here.
- **`verify:events` crashes without a `.env`** — it validates `NEXT_PUBLIC_APP_URL` at
  import. Environmental, not a bug; it passes where the vars are set.
- **From a cloud session the app hosts are blocked** by the network policy, so a cloud
  session cannot verify a deploy by loading the site. A local session can.

---

## 5. Housekeeping

The owner's password was visible in a screenshot shared into a chat on 28 Sep and should
be rotated wherever it is reused.
