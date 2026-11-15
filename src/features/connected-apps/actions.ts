"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret, encryptWithSecret } from "@/lib/crypto";
import { TOOLS } from "@/mcp/tools";
import { entitlementCache, forgetConnectedApps } from "@/mcp/gateway";
import { createHttpPort } from "@/mcp/gateway/http-port";
import { connectedAppInput, type ConnectedAppTest } from "@/features/connected-apps/schema";

/** Super admin, Connected apps: add or change one app the MCP gateway connects to. */
export async function saveConnectedApp(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const parsed = connectedAppInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join(" ") };
  const v = parsed.data;
  if (v.prefix === "assess360" || TOOLS.some((t) => t.name.startsWith(`${v.prefix}_`)) || ["list", "dismiss"].includes(v.prefix)) {
    return { ok: false, error: `The prefix ${v.prefix} clashes with an Assess360 tool name. Pick another.` };
  }
  const clash = await prisma.mcpUpstreamApp.findFirst({ where: { prefix: v.prefix, ...(v.id ? { NOT: { id: v.id } } : {}) }, select: { id: true } });
  if (clash) return { ok: false, error: `Another app already uses the prefix ${v.prefix}.` };

  const data = {
    prefix: v.prefix,
    name: v.name,
    url: v.url || null,
    description: v.description,
    upgradeUrl: v.upgradeUrl || null,
    enabled: v.enabled,
    sortOrder: v.sortOrder,
    ...(v.secret && v.secret.trim() ? { secretEnc: encryptWithSecret(v.secret.trim(), env.BETTER_AUTH_SECRET) } : {}),
  };
  if (v.id) await prisma.mcpUpstreamApp.update({ where: { id: v.id }, data });
  else await prisma.mcpUpstreamApp.create({ data });
  forgetConnectedApps();
  revalidatePath("/admin/connected-apps");
  return { ok: true };
}

/** Asks the app, as the signed-in super admin: is this email active there, and which tools does it list? */
export async function testConnectedApp(id: string): Promise<ConnectedAppTest> {
  const user = await requireSuperAdmin();
  const row = await prisma.mcpUpstreamApp.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "No such app." };
  if (!row.url) return { ok: false, error: "Set its URL first." };
  const app = {
    prefix: row.prefix,
    name: row.name,
    url: row.url,
    secret: row.secretEnc ? (decryptWithSecret(row.secretEnc, env.BETTER_AUTH_SECRET) ?? "") : "",
    description: row.description,
    upgradeUrl: row.upgradeUrl,
  };
  const port = createHttpPort();
  try {
    const active = await port.entitlement(app, user.email);
    const tools = active ? (await port.listTools(app, user.email)).map((t) => t.name) : [];
    entitlementCache.forget(user.email);
    return { ok: true, active, tools };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
