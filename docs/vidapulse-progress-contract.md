# VidaPulse → Assess360 watch-progress contract

**Status:** Assess360 side built 17-10-2026. VidaPulse side is being built separately.
Until the player emits, Assess360 simply never receives anything and shows no watch
figure. Nothing breaks while one half is missing.

This file is the agreement between the two. Both sides must match it exactly.

---

## Direction and transport

The player runs inside a cross-origin `<iframe>` on the Assess360 result page
(`/a/<slug>/r/<submissionId>?t=<token>`). It already talks upward with
`window.parent.postMessage` — `vidapulse_ids` and `vidapulse_session` — so this is one
more message on the pipe that exists, not a new channel.

```
VidaPulse player (inside iframe)  ──postMessage──▶  Assess360 result page
```

## The message

```js
window.parent.postMessage({
  type           : 'vidapulse_progress',  // exact string
  video_id       : VID,                   // string
  session_id     : sid,                   // string, the VidaPulse analytics session
  max_pct        : 0-100,                 // furthest point reached in THIS session
  watched_seconds: number,                // seconds actually watched in THIS session
  duration       : number | null,         // total length of the video, seconds
  cid            : CID || null,           // the Assess360 customerId that rode in
}, '*');
```

### When to send

Match the existing ping cadence, so no new timers are needed:

- every heartbeat while playing (~10 s)
- on pause, on seek, on end
- on the 25 / 50 / 75 / 100 milestones that already fire

Sending more often is harmless. Assess360 merges rather than appends, so a duplicate
report for a session changes nothing.

### What the numbers mean

🔴 **Per session, not per person.** Assess360 knows this and does the cross-visit
merge itself. Do NOT try to send a lifetime figure: a new session starting at zero is
expected and correct, and Assess360 keeps each session under its own id so the totals
it derives can never fall.

`max_pct` and `watched_seconds` should be the same values already sent to
`/api/analytics/ping` for that session. No new measurement is needed.

---

## What Assess360 does with it

- Listens only while the result page is open, and **checks `event.origin` against the
  configured VidaPulse origin**. The existing messages target `'*'`, so without that
  check any iframe on the page could forge a completed watch.
- Posts it to its own server with the result token that already authorises the page.
- Merges per `session_id`: within a session the stored values only rise; across
  sessions, furthest-reached is the max and watch time is the sum.
- Shows the result on the Submissions row, so the owner knows whether a booked call has
  already heard the video.

## What is NOT covered

A watch that happens anywhere other than the Assess360 result page is invisible to this
channel: postMessage needs the parent page to exist. VidaPulse still records it, and
reading those is a future API keyed by `cid`, not part of this contract.

## Environment

Assess360 reads the allowed origin from `NEXT_PUBLIC_VIDAPULSE_ORIGIN`
(default `https://app.vidapulse.io`). If the player is served from another host, that
variable must be set on both Railway environments or every message is discarded.

🟡 `NEXT_PUBLIC_*` is inlined at BUILD time, so setting it needs a redeploy, not just a
restart. While the default is correct, nothing needs setting at all.
