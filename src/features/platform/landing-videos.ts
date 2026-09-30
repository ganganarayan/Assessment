"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, isStaff } from "@/lib/auth/guards";
import { parseEmbed, readLandingVideos } from "@/lib/marketing/embed";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Landing-page videos — PLATFORM ONLY.
 *
 * These live on the singleton AppSetting row and are deliberately excluded from the
 * re-home copy (see scripts/rehome-platform-data.ts): the marketing site is the SaaS
 * shopfront, not something a tenant owns or should inherit.
 *
 * Stored as pasted, validated on save AND re-validated on read — so tightening the
 * host allowlist later retires existing videos instead of leaving them live.
 */

export interface LandingVideoInput {
  /** Hero video; blank clears it and the hero image returns. */
  hero: string;
  /** Capability title -> embed. A blank value removes that tile's video. */
  tiles: Record<string, string>;
}

/** Read the raw stored values for the editor (what the owner pasted, not the parsed URL). */
export async function getLandingVideosRaw(): Promise<
  ActionResult<{ hero: string; tiles: Record<string, string> }>
> {
  await requireSuperAdmin();
  try {
    const row = await prisma.appSetting.findUnique({
      where: { id: "singleton" },
      select: { landingVideos: true },
    });
    const v = row?.landingVideos;
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: true, data: { hero: "", tiles: {} } };
    const o = v as { hero?: unknown; tiles?: unknown };
    const tiles: Record<string, string> = {};
    if (o.tiles && typeof o.tiles === "object" && !Array.isArray(o.tiles)) {
      for (const [k, raw] of Object.entries(o.tiles as Record<string, unknown>)) {
        if (typeof raw === "string") tiles[k] = raw;
      }
    }
    return { ok: true, data: { hero: typeof o.hero === "string" ? o.hero : "", tiles } };
  } catch (e) {
    console.error("[platform] getLandingVideosRaw failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Couldn't load the landing videos (a temporary database error)." };
  }
}

/**
 * Save the landing videos. Every non-blank value must parse to an allowed embed URL, and
 * the WHOLE save is rejected if any one of them does not.
 *
 * All-or-nothing on purpose: a partial save would leave the owner looking at a form they
 * believe they submitted, with some videos live and some not, and no way to tell which.
 * The error names the field so the fix is obvious.
 */
export async function saveLandingVideos(input: LandingVideoInput): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  if (isStaff(me)) {
    return { ok: false, error: "Only an owner can edit the landing page." };
  }

  const hero = (input?.hero ?? "").trim();
  if (hero) {
    const p = parseEmbed(hero);
    if (!p.ok) return { ok: false, error: `Hero video: ${p.error}` };
  }

  const tiles: Record<string, string> = {};
  for (const [title, raw] of Object.entries(input?.tiles ?? {})) {
    const value = (raw ?? "").trim();
    if (!value) continue; // blank = no video on that tile, which is a valid state
    const p = parseEmbed(value);
    if (!p.ok) return { ok: false, error: `"${title}": ${p.error}` };
    tiles[title] = value;
  }

  try {
    await prisma.appSetting.update({
      where: { id: "singleton" },
      data: { landingVideos: { hero: hero || null, tiles } },
    });
  } catch (e) {
    console.error("[platform] saveLandingVideos failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Couldn't save the landing videos (a temporary database error). Try again." };
  }

  // The landing page is statically rendered per request but cached; revalidate it so the
  // change is visible without a redeploy.
  revalidatePath("/");
  revalidatePath("/platform");
  return { ok: true };
}

/**
 * The PUBLIC read used by the landing page: parsed, allowlisted embed URLs only.
 * Never throws — the marketing page must render even if this row is unreadable, so a
 * failure degrades to "no videos" (the image and the plain tiles) rather than a 500 on
 * the front door.
 */
export async function getLandingVideos() {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { id: "singleton" },
      select: { landingVideos: true },
    });
    return readLandingVideos(row?.landingVideos ?? null);
  } catch (e) {
    console.error("[platform] getLandingVideos failed:", e instanceof Error ? e.message : String(e));
    return { hero: null, tiles: {} };
  }
}
