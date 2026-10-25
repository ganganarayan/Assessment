# Lifecycle WhatsApp templates: what to submit to Meta

Six templates. Submit them exactly as written below, in WhatsApp Manager under
Account tools, Message templates, Create template.

Nothing WhatsApp-shaped in the lifecycle engine works until these are approved, and
approval takes a day or two. Email runs the whole sequence without them, so this is
not a blocker for turning the engine on, only for the six stages that add a message.

---

## Read this before you submit anything

**Why there is no single template with one big variable.** The obvious design is one
approved shell with a `{{1}}` that the model fills with whatever it wrote. It does not
work, for three separate reasons, and each one is enough on its own:

1. **It fails review.** Meta rejects templates whose body is mostly placeholder. There
   has to be enough fixed text for a human reviewer to judge what the message says.
2. **If it ever passed, using it that way is circumvention.** Pushing arbitrary varying
   content through an approved shell is exactly what template review exists to stop.
   The penalty is not a rejection letter, it is the number's quality rating dropping,
   then templates being paused, then the messaging limit being cut.
3. **The copy is worse.** A template with real fixed text and three short, specific
   slots reads like a message. A generated paragraph reads like a generated paragraph.

So the model picks which of these six to send and fills short values. It never writes
WhatsApp prose.

**Why six and not twelve.** The engine has twelve stages and only six carry a
template. Daily marketing templates for a fortnight to the same person is how a number
gets reported and throttled. Email carries the sequence; WhatsApp marks the moments
that cannot wait.

**Category.** Submit all six as **MARKETING**. Some of them read like utility (a trial
end date is arguably transactional) but Meta re-categorises on its own judgement, and
budgeting for the cheaper category and being moved to the dearer one is a bill you did
not plan. India marketing is roughly ₹0.78 to ₹0.88 per message against roughly ₹0.11
to ₹0.13 for utility. 🟡 Check the current rate card before relying on either number.

**Buttons are static URLs, with no variables in them.** The sender
(`sendWaba` in lib/nurture/send.ts) sends body parameters only. A button carrying its
own variable would need a component the sender does not build, so every button below
points at a fixed page.

**After they reply you have a 24 hour window** in which free-form text is allowed. That
is where longer, fully written WhatsApp copy becomes possible. The template opens the
door; it is not meant to carry the whole conversation.

---

## The six

Language: **English** for all of them. Header: **none** for all of them. Footer: leave
blank, the engine does not use one.

Variables must be numbered from 1 with no gaps, must not sit at the very start or very
end of the body, and must not be adjacent to each other. All six below already comply.

---

### 1. `trial_welcome`

Sent on day 1. Stage `welcome`.

**Body**

```
Hi {{1}}, your Assess360 workspace is ready. You have {{2}} days left on your trial. The next thing to do is {{3}}, and it takes about five minutes. Reply to this message if you get stuck and a person will answer.
```

| Slot | Holds | Sample for the submission form |
|---|---|---|
| {{1}} | First name | Ganga |
| {{2}} | Days left | 14 |
| {{3}} | The one next step, a few words | build your first scorecard |

**Button:** Visit website, `https://assess360.divineleads.guru/sign-in`, label `Open my workspace`

---

### 2. `trial_resume`

Sent when they created the workspace and never came back. Stage `no_login`.

**Body**

```
Hi {{1}}, your Assess360 trial has {{2}} days left and the workspace is still sitting there waiting. You stopped at {{3}}. Picking it up takes a minute and everything is exactly where you left it.
```

| Slot | Holds | Sample |
|---|---|---|
| {{1}} | First name | Ganga |
| {{2}} | Days left | 11 |
| {{3}} | Where they stopped, a few words | choosing a starter template |

**Button:** Visit website, `https://assess360.divineleads.guru/sign-in`, label `Pick up where I left off`

---

### 3. `trial_publish`

Sent when a funnel is built and never published. Stage `built_not_published`.

**Body**

```
Hi {{1}}, your funnel {{2}} is built and ready, but it has not been published, so nobody can reach it yet. Publishing is one click. There are {{3}} days left on your trial.
```

| Slot | Holds | Sample |
|---|---|---|
| {{1}} | First name | Ganga |
| {{2}} | The funnel title | Clinic Audit |
| {{3}} | Days left | 9 |

**Button:** Visit website, `https://assess360.divineleads.guru/sign-in`, label `Publish it`

---

### 4. `trial_first_lead`

Sent the first time a real response lands. Stage `first_response`.

**Body**

```
Hi {{1}}, your first response just came through on {{2}}, and it scored {{3}}. Open Submissions to see what the funnel decided about them and why it put them where it did.
```

| Slot | Holds | Sample |
|---|---|---|
| {{1}} | First name | Ganga |
| {{2}} | The funnel title | Clinic Audit |
| {{3}} | The score or band | 72, Strong |

**Button:** Visit website, `https://assess360.divineleads.guru/sign-in`, label `See the response`

---

### 5. `trial_book_call`

Sent when they are using it and have not booked. Stage `call_nudge`.

**Body**

```
Hi {{1}}, you have {{2}} days left on your Assess360 trial. A 30 minute call is the quickest way to sort {{3}}, and you come away with it done rather than with a list of things to try.
```

| Slot | Holds | Sample |
|---|---|---|
| {{1}} | First name | Ganga |
| {{2}} | Days left | 6 |
| {{3}} | The one thing the call fixes | getting your first qualified leads in |

**Button:** Visit website, `https://assess360.divineleads.guru/book`, label `Pick a time`

🟡 Point this at whatever the real booking URL is before submitting. A button URL
cannot be edited after approval without resubmitting the template.

---

### 6. `trial_ending`

Sent on days 12 and 13. Stage `closing_days`.

**Body**

```
Hi {{1}}, your Assess360 trial ends on {{2}}, which is {{3}} days away. Nothing is deleted when it does. Your funnels, responses and settings stay exactly as they are and the workspace becomes read only until you subscribe.
```

| Slot | Holds | Sample |
|---|---|---|
| {{1}} | First name | Ganga |
| {{2}} | End date, DD-MM-YYYY | 07-11-2026 |
| {{3}} | Days left | 2 |

**Button:** Visit website, `https://assess360.divineleads.guru/w/billing`, label `See the plans`

---

## After they are approved

The template names in `src/lib/lifecycle/stages.ts` must match what Meta approved,
character for character. They already read:

```
trial_welcome  trial_resume  trial_publish  trial_first_lead  trial_book_call  trial_ending
```

If Meta makes you rename one, change it in that file as well or the send fails with
a template-not-found error and the row records it.

The slot COUNT also has to match. Every stage above declares `waSlots: 3`, and the
sender drops the WhatsApp message entirely if the model returns a different number,
which is a quiet skip rather than a malformed send. If you change a body to take two
variables instead of three, change `waSlots` with it.

## What is still needed besides approval

- The WhatsApp connection itself, under Settings. The `whatsapp` release key also has
  to be on, and the Meta app still needs Tech Provider approval.
- The owner's number on their own login (`User.whatsapp`). Blank means that person
  gets email only, which the engine handles silently and by design.
