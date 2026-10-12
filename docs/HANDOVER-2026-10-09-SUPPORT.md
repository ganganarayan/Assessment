# Handover: 2026-10-09 - in-app ticketing and onboarding support

**On staging.** Typechecked, linted, verified, pushed.

🔴 **This app sends no WhatsApp.** A reply posts to the owner's CRM webhook and the CRM
sends whatever it sends. The owner's CRM already holds the approved templates, the
opt-in state and the sending number; a second sender here would be a second template to
approve, a second number to keep warm, and two sets of sends to reconcile the day
somebody asks whether a customer was actually told.

Design and critique were agreed in the chat titled "In-app ticketing and onboarding
support". Decisions carried in from it: fixed topics, inline notification with a Resend
button (no cron), owner only on the tenant side, no scheduling, and a per-kind
IN_APP / EMAIL / OFF switch. WhatsApp was dropped in favour of the webhook after the
first build, by the owner's decision.

---

## 1. What it does

**One model, two menu items.** A ticket and an onboarding request have the same
lifecycle, notify path, badge and thread, so `kind` splits the screens and the topic
list rather than a second set of tables.

Tenant side, under a new **Support** section in the workspace rail:

- **Raise a ticket** at /w/support, **Onboarding help** at /w/onboarding
- Fixed topic dropdown, a one-line subject, the detail, up to 3 screenshots
- Auto-reply email carrying the reference, **AS-1042** for a ticket and **OB-1042** for
  an onboarding request
- Their own red badge when the owner has replied and they have not opened it

Owner side, under a new **Support** section in the admin rail:

- **Tickets** at /admin/support, **Onboarding** at /admin/onboarding, each with the red
  count of threads waiting on us
- Thread view: who asked, their contact details, first-response time, the conversation,
  screenshots, a reply box, a separate private-note box, status buttons, and a hand to
  the support inbox
- A reply fires an email, and one POST to the CRM webhook when the mode is in-app

Settings, super admin only: **Support and onboarding requests**, holding both modes, the
support inbox address, and the CRM webhook URL with a **Send a test** button.

---

## 2. The switch, which is the part worth reading

| | Tenant menu | Can raise | Owner badge | On raise | Who answers |
|---|---|---|---|---|---|
| **IN_APP** | shown | yes | yes, red | auto-reply to the tenant, alert to the owner | the owner, in the thread. Email plus the CRM post fire |
| **EMAIL** | shown | yes | **none** | auto-reply, **plus the whole thread forwarded to the inbox** | support, from their own mail client, straight to the customer |
| **OFF** | hidden unless they have a thread | refused | none | nothing | nobody |

Four things this gets right on purpose:

- 🔴 **The CRM post fires in IN_APP mode only.** What it produces says "there is a reply
  in your dashboard", which is a lie the moment the answer goes to their inbox instead.
- 🔴 **EMAIL mode means the conversation genuinely moves.** There is no inbound mail
  ingestion in this app, so the thread goes to **FORWARDED** and the tenant's screen says
  the answer is in their email. Making support's replies appear back in-app needs reply
  tokens, quote stripping, attachment re-upload and spoof checks; it is a separate
  project and is not half-built here.
- 🟡 **Reply-To on a forward is the TENANT.** Support hits Reply and reaches the
  customer. With the platform address there, every forwarded ticket comes straight back
  to the mailbox the switch existed to get away from.
- 🟡 **Switching to EMAIL forwards everything already open, once,** and the Save message
  says how many went. `forwardedAt` is the once-guard, so flipping back and forth never
  double-sends. Without this, the badge disappears while nobody has been emailed.

EMAIL mode cannot be saved with a blank inbox address. A forward with nowhere to go is a
black hole with a confirmation message on top of it.

---

## 3. Schema and migration

Migration **20261009170000_support_requests**, not yet applied anywhere.

- `support_request` - number (from a sequence), kind, status, topic, subject, tenantId,
  createdByUserId, **contactEmail and contactWhatsapp snapshotted at raise time**,
  lastSeenByTenantAt, firstResponseAt, forwardedAt
- `support_message` - authorRole, authorName, body, isInternal, and what the send
  actually did (emailStatus/emailError, webhookStatus/webhookError)
- `support_attachment` - R2 key, filename, contentType, bytes
- `user.whatsapp`
- `app_setting.supportMode`, `onboardingMode`, `supportInboxEmail`, `supportWebhookUrl`

Two decisions in the SQL:

- 🔴 **The number is a Postgres SEQUENCE**, hand-written, starting at 1001. A
  count-and-add hands two simultaneous tickets the same number, and the number is what
  the customer quotes back. One sequence feeds both kinds, so the prefix is the only
  thing distinguishing AS from OB and a number can never name two threads. 1001 because
  AS-1 reads like a test row and gets treated as one.
- Statuses and kinds are **enums**; the two modes are **strings**, following
  dfy_request.status. The modes are an operational routing choice that will be renamed
  while the support process is worked out, and renaming a Postgres enum value costs a
  migration.

Contacts are snapshotted rather than read live at reply time: a reply answers the person
who asked, on the address the conversation started on, and a removed login does not take
the thread's only way of reaching anybody with it.

---

## 4. The eleven traps, and where each one is handled

1. **An operator inside a workspace must not write as the customer.** Raising, replying
   and saving a number all refuse while impersonating, and the screens go read-only with
   a link to the console. 🔴 The one that mattered: without it, the owner opening a
   customer's thread from inside their workspace put out the customer's own "you have a
   reply" badge before they had ever seen it, and nothing would ever light it again.
2. **A false FORWARDED.** If the forward on raise fails to send, the thread stays in-app
   and the owner is alerted instead. FORWARDED tells the customer the answer is in their
   inbox; setting it on a send that failed is a lie they sit in front of.
3. **Three 5mb screenshots exceed the 8mb action body**, so the submit would die at the
   transport with nothing to show. Per-file 3mb, 6mb total, enforced on the server and
   checked on the client, and pinned by verify:support.
4. **A screenshot that did not attach is reported.** The names come back from the action
   and the form stays put to show them, rather than redirecting on to the thread where
   the gap is discovered three replies later.
5. **Attachments are never a bucket URL.** They stream through
   /api/support/attachments/[id], which authorises first and 404s rather than 403s. A
   screenshot of a stuck funnel carries lead names, and a public object URL is guessable
   forever.
6. **The private note is its own box and its own button.** A reply sends the instant it
   is saved and there is no unsend, so a shared textarea with a tick is one wrong tick
   away from mailing an internal note to the customer.
7. **The reply confirmation names the recipient and the channels**, because "are you
   sure?" tells the owner nothing they did not already know.
8. **A failed send is visible in the thread** with a Resend button that re-sends the same
   message, so the customer can never receive two versions of one reply. This is the
   whole reason sending is inline rather than queued.
9. **The badge query is skipped** when a queue is not in-app, and soft-deleted tenants
   are excluded. A number nobody can clear is a number nobody reads.
10. **A parked workspace can still reach support.** /w/support and /w/onboarding joined
    /w/billing as exempt from the lock: a parked account is the account most likely to
    need help, and locking the only way they have of asking gives them a reason to leave
    rather than to pay.
11. **Owner only on the tenant side**, in the actions and in the rail, because read-only
    staff enforcement is still not wired across the app.

---

## 5. The CRM webhook

One POST per reply, in in-app mode only, https required, 10 second timeout, **no
automatic retry**: the failure is stamped on the message, shown in the thread, and the
Resend button is the retry. An automatic one would double-message a customer the moment
a CRM answered slowly rather than not at all.

```json
{
  "event_type": "support_reply",
  "reference": "AS-1042",
  "kind": "SUPPORT",
  "request_id": "clz...",
  "topic": "My funnel is not collecting leads",
  "subject": "Submissions stopped arriving",
  "thread_url": "https://.../w/support/clz...",
  "tenant_id": "clz...",
  "tenant_name": "Acme Clinic",
  "contact_name": "Deepak",
  "contact_email": "deepak@acme.com",
  "contact_phone": "+919999999999",
  "reply_body": "Fixed, try again.",
  "reply_at": "2026-10-09T18:30:00.000Z",
  "test": false
}
```

- Flat **contact_name / contact_email / contact_phone**, which are the keys the owner's
  CRM automations already map. A nested shape would read better here and cost a mapping
  exercise there.
- **contact_phone is present and null** when that login has saved no number, never
  missing: a mapping cannot tell "no number" apart from "the key was dropped in this
  version", and the two need different handling.
- **test is true only for the Send a test button**, so a CRM can drop it rather than
  message whoever the sample names.
- The keys are pinned by verify:support against REPLY_PAYLOAD_KEYS in
  src/lib/support/payload.ts, which is a plain module precisely so the contract can be
  checked without booting the app.

## 6. Before it can be used

- 🟡 **Paste the CRM webhook URL in Settings and press Send a test.** Worth doing once:
  a URL with a typo breaks nothing visible, since the reply email still goes and the
  thread still says answered, and the only symptom is a WhatsApp that never arrived.
- 🟡 **Set the support inbox address** even while staying in-app: it is also where the
  new-request alert goes, and email mode cannot be saved without it.
- Tenants have no WhatsApp number until they fill one in on /w/settings. Until then
  contact_phone arrives null and the thread says support can only reach them by email.

## 7. Gates run

```
npx prisma validate          valid
npx next typegen && npx tsc --noEmit   clean
npx eslint .                 0 errors (5 pre-existing warnings)
npm run verify:support       ALL PASS (63 checks, no DB, incl. the webhook payload)
npm run verify:flow          OK
npm run verify:seo           OK
```

🟡 Another session is editing src/lib/marketing/industries.ts and
src/components/marketing/IndustryLeak.tsx in this working tree. Those changes are not
part of this work and were deliberately left unstaged, along with
docs/seo/keyword-map.json, which verify:seo regenerated from their edit.

🟡 The migration was EDITED IN PLACE when WhatsApp was dropped, rather than followed by
a second migration renaming what the first had just created. Safe only because it had
never been applied anywhere at that point. It has now shipped, so the next change to
these tables needs its own migration.
