"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied, configTenantOf } from "@/lib/tenant/acting";
import { featureDenied } from "@/lib/features/release";
import { resolveWabaConfig } from "@/lib/settings/config";
import { submitTemplate, listTemplateStatuses } from "@/lib/whatsapp/templates";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { waTemplateSchema } from "@/features/wa-templates/schemas";
import {
  templateIssues,
  variableCount,
  type TemplateDraft,
  type WaTemplateStatusValue,
} from "@/features/wa-templates/types";

/**
 * The template builder's actions: draft, submit, refresh, delete.
 *
 * Same scope contract as automations - the ACTING workspace, view-only staff cannot
 * mutate, and every id is checked against that workspace before it is touched.
 */

function refresh() {
  revalidatePath("/admin/wa-templates");
  revalidatePath("/w/wa-templates");
}

async function editor(): Promise<{ tenantId: string } | { error: string }> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return { error: denied.error };
  const tenantId = configTenantOf(scope);
  const held = await featureDenied("waTemplates", tenantId);
  if (held) return { error: held.error };
  return { tenantId };
}

/** One row, proved to belong to this workspace. */
async function own(tenantId: string, id: string) {
  return prisma.waTemplate.findFirst({ where: { id, tenantId } });
}

/**
 * Meta's status word to ours.
 *
 * 🟡 An unfamiliar value maps to null and the caller leaves our enum ALONE, keeping
 * Meta's string in metaStatus where the owner can read it. Meta adds statuses
 * (PENDING_DELETION, IN_APPEAL) without warning, and flattening one of those into the
 * nearest match would tell somebody their template was fine when it was on its way out.
 */
function mapStatus(meta: string): WaTemplateStatusValue | null {
  switch (meta.toUpperCase()) {
    case "APPROVED":
      return "APPROVED";
    case "PENDING":
    case "IN_APPEAL":
      return "PENDING";
    case "REJECTED":
      return "REJECTED";
    case "PAUSED":
      return "PAUSED";
    case "DISABLED":
      return "DISABLED";
    default:
      return null;
  }
}

/**
 * Create or update a draft.
 *
 * 🔴 NAME AND LANGUAGE ARE FROZEN ONCE META HAS THE TEMPLATE. Together they are Meta's
 * primary key, so changing either and submitting again creates a SECOND template on the
 * account while this row goes on pointing at the first. The next status sync would then
 * read the wrong template's verdict. Refused here rather than hidden in the UI alone.
 */
export async function saveWaTemplate(input: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const parsed = waTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those details are not valid." };
  }
  const v = parsed.data;

  const existing = id ? await own(auth.tenantId, id) : null;
  if (id && !existing) return { ok: false, error: "That template is not in this workspace." };
  if (existing && (existing.metaId || existing.status !== "DRAFT")) {
    if (existing.name !== v.name || existing.language !== v.language) {
      return {
        ok: false,
        error:
          "Meta already has this template, so its name and language cannot change. Make a new one instead.",
      };
    }
  }

  const data = {
    name: v.name,
    language: v.language,
    category: v.category,
    headerText: v.headerText.trim() || null,
    bodyText: v.bodyText,
    footerText: v.footerText.trim() || null,
    sampleValues: v.sampleValues,
  };

  try {
    const row = existing
      ? await prisma.waTemplate.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.waTemplate.create({
          data: { tenantId: auth.tenantId, ...data },
          select: { id: true },
        });
    refresh();
    return { ok: true, data: { id: row.id } };
  } catch {
    // The unique index is (tenant, name, language), and this is the only way to hit it.
    return { ok: false, error: "A template with that name already exists in this language." };
  }
}

/** Delete a draft. */
export async function deleteWaTemplate(id: string): Promise<ActionResult> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };
  const row = await own(auth.tenantId, id);
  if (!row) return { ok: false, error: "That template is not in this workspace." };
  // 🟡 Deleting here does NOT delete it at Meta. Saying so is the honest thing: an
  // owner who believes it did would be surprised to see it still sending.
  await prisma.waTemplate.delete({ where: { id: row.id } });
  refresh();
  return { ok: true };
}

/**
 * Send one template to Meta for review.
 *
 * Re-checks every rule server side before the call. The builder shows them while the
 * owner types, but a submission is not reversible and a rejection costs the account's
 * standing, so the last word is here rather than in a browser.
 */
export async function submitWaTemplate(id: string): Promise<ActionResult<{ status: string }>> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };
  const row = await own(auth.tenantId, id);
  if (!row) return { ok: false, error: "That template is not in this workspace." };
  if (row.status === "PENDING") return { ok: false, error: "Meta is already reviewing this one." };
  if (row.status === "APPROVED") return { ok: false, error: "Meta has already approved this one." };

  const draft: TemplateDraft = {
    name: row.name,
    language: row.language,
    category: row.category,
    headerText: row.headerText ?? "",
    bodyText: row.bodyText,
    footerText: row.footerText ?? "",
    sampleValues: Array.isArray(row.sampleValues)
      ? (row.sampleValues as unknown[]).map((x) => (typeof x === "string" ? x : ""))
      : [],
  };
  const issues = templateIssues(draft);
  if (issues.length > 0) return { ok: false, error: issues[0] ?? "That template is not ready." };

  const waba = await resolveWabaConfig(auth.tenantId);
  if (!waba.businessAccountId) {
    return { ok: false, error: "Add your WhatsApp Business Account ID in Settings → WhatsApp first." };
  }
  if (!waba.accessToken) return { ok: false, error: "Add your WhatsApp access token in Settings first." };

  const res = await submitTemplate({
    wabaId: waba.businessAccountId,
    token: waba.accessToken,
    apiVersion: waba.apiVersion,
    draft,
    varCount: variableCount(row.bodyText),
  });
  if (!res.ok) {
    await prisma.waTemplate
      .update({ where: { id: row.id }, data: { rejectedReason: res.error.slice(0, 500) } })
      .catch(() => {});
    refresh();
    return { ok: false, error: res.error };
  }

  const mapped = res.status ? mapStatus(res.status) : null;
  await prisma.waTemplate.update({
    where: { id: row.id },
    data: {
      metaId: res.metaId,
      metaStatus: res.status ?? null,
      // Meta answers PENDING almost always; anything it does not recognise still counts
      // as submitted, because the template is on the account either way.
      status: mapped ?? "PENDING",
      rejectedReason: null,
      submittedAt: new Date(),
      syncedAt: new Date(),
    },
  });
  refresh();
  return { ok: true, data: { status: res.status ?? "PENDING" } };
}

/**
 * Ask Meta what became of everything submitted, and write the answers down.
 *
 * One call for the whole account rather than one per template: an owner with twenty
 * templates should not make twenty requests to refresh a page, and Meta rate-limits
 * management calls.
 */
export async function syncWaTemplates(): Promise<ActionResult<{ updated: number }>> {
  const auth = await editor();
  if ("error" in auth) return { ok: false, error: auth.error };

  const waba = await resolveWabaConfig(auth.tenantId);
  if (!waba.businessAccountId) {
    return { ok: false, error: "Add your WhatsApp Business Account ID in Settings → WhatsApp first." };
  }
  if (!waba.accessToken) return { ok: false, error: "Add your WhatsApp access token in Settings first." };

  const res = await listTemplateStatuses({
    wabaId: waba.businessAccountId,
    token: waba.accessToken,
    apiVersion: waba.apiVersion,
  });
  if (!res.ok) return { ok: false, error: res.error };

  // Drafts are ours alone and Meta has never heard of them, so they are not in this
  // comparison: a draft absent from Meta's list is absent because it was never sent.
  const mine = await prisma.waTemplate.findMany({
    where: { tenantId: auth.tenantId, status: { not: "DRAFT" } },
  });

  let updated = 0;
  const now = new Date();
  for (const row of mine) {
    const seen = res.byKey.get(`${row.name}::${row.language}`);
    if (!seen) {
      // Submitted here, gone at Meta: somebody deleted it in Business Manager. Say so
      // rather than leaving it reading APPROVED forever.
      await prisma.waTemplate
        .update({
          where: { id: row.id },
          data: { status: "DISABLED", metaStatus: "NOT_FOUND", rejectedReason: "Deleted at Meta.", syncedAt: now },
        })
        .catch(() => {});
      updated++;
      continue;
    }
    const mapped = mapStatus(seen.status);
    await prisma.waTemplate
      .update({
        where: { id: row.id },
        data: {
          metaId: seen.id ?? row.metaId,
          metaStatus: seen.status,
          ...(mapped ? { status: mapped } : {}),
          rejectedReason: seen.rejectedReason,
          syncedAt: now,
        },
      })
      .catch(() => {});
    updated++;
  }

  refresh();
  return { ok: true, data: { updated } };
}
