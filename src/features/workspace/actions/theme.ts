"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { DEFAULT_THEME_COLORS, type ThemeColors } from "@/features/workspace/theme-colors";

const hex = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Enter valid hex colors like #4F46E5.");

const schema = z.object({ primaryColor: hex, secondaryColor: hex });

/** Read this tenant's brand colors (defaults when the tenant has no theme row). */
export async function getThemeColors(): Promise<ThemeColors> {
  const { tenantId } = await requireWorkspace();
  const t = await prisma.theme.findUnique({
    where: { tenantId },
    select: { primaryColor: true, secondaryColor: true },
  });
  return {
    primaryColor: t?.primaryColor ?? DEFAULT_THEME_COLORS.primaryColor,
    secondaryColor: t?.secondaryColor ?? DEFAULT_THEME_COLORS.secondaryColor,
  };
}

/** Write this tenant's brand colors. Hex is validated before it is ever injected as CSS. */
export async function updateThemeColors(input: ThemeColors): Promise<ActionResult> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid color." };
  }
  const { primaryColor, secondaryColor } = parsed.data;

  await prisma.theme.upsert({
    where: { tenantId },
    update: { primaryColor, secondaryColor },
    create: { tenantId, primaryColor, secondaryColor },
  });

  revalidatePath("/w/settings");
  revalidatePath("/", "layout"); // re-apply the injected tenant colors everywhere
  return { ok: true };
}
