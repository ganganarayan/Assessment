"use server";

import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";

/** Stored UTC instant -> IST datetime-local value "YYYY-MM-DDTHH:mm" for the input. */
function toIstLocalInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export async function getStatsWindow(): Promise<
  ActionResult<{ startAtInput: string; startAtIso: string | null }>
> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { statsResetAt: true },
  });
  return {
    ok: true,
    data: {
      startAtInput: toIstLocalInput(s?.statsResetAt ?? null),
      startAtIso: s?.statsResetAt?.toISOString() ?? null,
    },
  };
}

/**
 * Set (or clear) the reporting start date. `istLocal` is the datetime-local value
 * in IST ("YYYY-MM-DDTHH:mm"); null/empty clears it (show all data). Stored UTC.
 */
export async function setStatsWindow(istLocal: string | null): Promise<ActionResult> {
  await requireSuperAdmin();
  let value: Date | null = null;
  const v = (istLocal ?? "").trim();
  if (v) {
    const withSeconds = v.length === 16 ? `${v}:00` : v;
    const d = new Date(`${withSeconds}+05:30`);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Enter a valid date and time." };
    value = d;
  }
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: { statsResetAt: value },
    create: { id: "singleton", statsResetAt: value },
  });
  return { ok: true };
}
