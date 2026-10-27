import "server-only";
import { prisma } from "@/lib/db/prisma";
import { zoomAccessToken } from "@/lib/zoom/oauth";

/**
 * Making and unmaking a Zoom meeting for one appointment.
 *
 * Fail-soft throughout: a booking must never fail because Zoom is down. A failure is
 * written to Appointment.zoomError, where the owner can see it on the appointment
 * itself, and the booking stands with whatever location the link already had.
 */

const API = "https://api.zoom.us/v2";

interface CreatedMeeting {
  id?: number | string;
  join_url?: string;
}

/**
 * Create the meeting and put its link on the appointment.
 *
 * Idempotent: an appointment that already has a link keeps it, so a re-run of the rule,
 * a retry after a failed email, or an owner pressing something twice cannot litter
 * somebody's Zoom account with duplicate meetings for one call.
 *
 * Returns the join URL so the step that follows can use it immediately, rather than
 * waiting for the appointment to be read again.
 */
export async function createZoomMeeting(args: {
  appointmentId: string;
  tenantId: string;
  topic: string;
  startAt: Date;
  durationMin: number;
}): Promise<string | null> {
  const existing = await prisma.appointment
    .findUnique({ where: { id: args.appointmentId }, select: { zoomJoinUrl: true } })
    .catch(() => null);
  if (existing?.zoomJoinUrl) return existing.zoomJoinUrl;

  const token = await zoomAccessToken(args.tenantId);
  if (!token) {
    await note(args.appointmentId, "Zoom is not connected for this workspace.");
    return null;
  }

  try {
    const res = await fetch(`${API}/users/me/meetings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        topic: args.topic.slice(0, 200),
        type: 2, // scheduled, at a fixed time
        start_time: args.startAt.toISOString(),
        duration: args.durationMin,
        // The instant is already absolute in start_time; naming the timezone keeps
        // Zoom's own UI showing the owner the hour they expect.
        timezone: "Asia/Kolkata",
        settings: {
          // Somebody who followed a link from an email should not then sit in a waiting
          // room wondering whether they are in the right place.
          join_before_host: true,
          waiting_room: false,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    const data = (text ? JSON.parse(text) : {}) as CreatedMeeting & { message?: string };
    if (!res.ok || !data.join_url) {
      await note(args.appointmentId, data.message ?? `Zoom returned ${res.status}`);
      return null;
    }

    await prisma.appointment.update({
      where: { id: args.appointmentId },
      data: {
        zoomMeetingId: data.id != null ? String(data.id) : null,
        zoomJoinUrl: data.join_url,
        zoomError: null,
      },
    });
    await prisma.zoomAccount
      .updateMany({ where: { tenantId: args.tenantId }, data: { lastUsedAt: new Date(), lastError: null } })
      .catch(() => {});
    return data.join_url;
  } catch (e) {
    await note(args.appointmentId, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Delete the meeting behind a cancelled appointment.
 *
 * Tidiness, not correctness: left alone, a workspace's Zoom fills with meetings for
 * calls that are not happening. Best-effort, and the appointment keeps its record of
 * what the link was.
 */
export async function deleteZoomMeeting(appointmentId: string): Promise<void> {
  const a = await prisma.appointment
    .findUnique({ where: { id: appointmentId }, select: { tenantId: true, zoomMeetingId: true } })
    .catch(() => null);
  if (!a?.zoomMeetingId) return;

  const token = await zoomAccessToken(a.tenantId);
  if (!token) return;
  try {
    await fetch(`${API}/meetings/${encodeURIComponent(a.zoomMeetingId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // A meeting left behind in Zoom is untidy, never wrong.
  }
}

async function note(appointmentId: string, message: string): Promise<void> {
  await prisma.appointment
    .update({ where: { id: appointmentId }, data: { zoomError: message.slice(0, 300) } })
    .catch(() => {});
}

/**
 * Make a Zoom meeting that belongs to no appointment.
 *
 * The function above exists because a booked call HAS a time and a row to write the
 * link onto. A workflow has neither: a sequence step fires when it fires, for whoever
 * is going through it, and the link it makes is handed to the messages below it rather
 * than to a calendar entry.
 *
 * 🟡 Scheduled an hour out and an hour long, because Zoom insists on a start time and
 * a sequence has no opinion about one. join_before_host is on for the same reason as
 * above: somebody following a link from an email should not sit in a waiting room
 * wondering whether they are in the right place.
 */
export async function createLooseZoomMeeting(args: {
  tenantId: string;
  topic: string;
}): Promise<{ joinUrl: string } | { error: string }> {
  const token = await zoomAccessToken(args.tenantId);
  if (!token) return { error: "Zoom is not connected for this workspace." };
  try {
    const res = await fetch(`${API}/users/me/meetings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        topic: args.topic.slice(0, 200),
        type: 2,
        start_time: new Date(Date.now() + 3600_000).toISOString(),
        duration: 60,
        timezone: "Asia/Kolkata",
        settings: { join_before_host: true, waiting_room: false },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    const data = (text ? JSON.parse(text) : {}) as CreatedMeeting & { message?: string };
    if (!res.ok || !data.join_url) return { error: data.message ?? `Zoom returned ${res.status}` };
    await prisma.zoomAccount
      .updateMany({ where: { tenantId: args.tenantId }, data: { lastUsedAt: new Date(), lastError: null } })
      .catch(() => {});
    return { joinUrl: data.join_url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
