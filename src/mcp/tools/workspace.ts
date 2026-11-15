import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { resolvePlan } from "@/lib/billing/plan-resolve";
import { PLATFORM_TENANT_ID } from "@/lib/tenant/platform-tenant";
import { publicOriginFor } from "@/lib/tenant/public-origin";
import { defineTool, type ToolDef } from "@/mcp/core/types";
import { readOnlyMessage } from "@/mcp/core/key-page";

const connectionStatus = defineTool({
  name: "connection_status",
  title: "Connection status",
  description:
    "Who this MCP key is, which workspace a call lands in, its plan, and what the key can reach and do. Call this first.",
  access: "read",
  input: z.object({}),
  run: async (ctx) => {
    const { identity, workspace } = ctx;
    const plan = await resolvePlan(workspace.id);
    return {
      connected: true,
      server: "assess360",
      version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      now: new Date(),
      key: {
        prefix: identity.tokenPrefix,
        label: identity.tokenLabel,
        access: identity.scope === "mcp_write" ? "read and write" : "read only",
        can_write: identity.scope === "mcp_write",
        // Said up front: a read-only key never even sees the write tools, so without this
        // Claude cannot tell the person why it is unable to build anything.
        read_only_notice: identity.scope === "mcp_write" ? undefined : readOnlyMessage(identity),
        acting_as: { name: identity.user.name, email: identity.user.email },
        reach: identity.isOwner
          ? "every workspace on the platform (owner key)"
          : identity.isAgency
            ? "this agency's workspace and its client workspaces"
            : "this workspace only",
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        public_origin: await publicOriginFor(workspace.id),
        plan: plan.isPlatform ? "platform" : plan.unlimited ? "internal (unlimited)" : (plan.plan ?? "none"),
        trialing: plan.trialing,
        paused: plan.parked,
        limits: {
          assessments: plan.limits.maxAssessments,
          client_workspaces: plan.limits.agencyTenants,
        },
      },
    };
  },
});

const listWorkspaces = defineTool({
  name: "list_workspaces",
  title: "List workspaces",
  description:
    "The workspaces this key can act on, with ids to pass as workspace_id. A workspace key sees only itself; an agency key sees itself and its client workspaces; the owner key sees every workspace.",
  access: "read",
  crossWorkspace: true,
  input: z.object({
    search: z.string().trim().max(80).optional().describe("Filter by name or slug (owner key)."),
    include_deleted: z.boolean().default(false).describe("Owner key only: include soft-deleted workspaces."),
  }),
  run: async (ctx, input) => {
    const { identity } = ctx;
    const where = identity.isOwner
      ? {
          ...(input.include_deleted ? {} : { deletedAt: null }),
          ...(input.search
            ? { OR: [{ name: { contains: input.search, mode: "insensitive" as const } }, { slug: { contains: input.search, mode: "insensitive" as const } }] }
            : {}),
        }
      : {
          deletedAt: null,
          OR: [{ id: identity.homeTenantId }, ...(identity.isAgency ? [{ agencyAdminTenantId: identity.homeTenantId }] : [])],
        };
    const rows = await prisma.tenant.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        unlimited: true,
        status: true,
        trialEndsAt: true,
        agencyAdminTenantId: true,
        deletedAt: true,
        createdAt: true,
        _count: { select: { assessments: true } },
      },
    });
    const list = rows.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      kind:
        t.id === PLATFORM_TENANT_ID
          ? "platform"
          : t.agencyAdminTenantId
            ? "client workspace"
            : t.unlimited
              ? "internal"
              : "workspace",
      home: t.id === identity.homeTenantId,
      plan: t.plan as string | null,
      status: t.deletedAt ? "deleted" : t.status,
      trial_ends: t.trialEndsAt,
      parent_agency_id: t.agencyAdminTenantId,
      assessments: t._count.assessments,
      created: t.createdAt,
    }));
    if (identity.isOwner && !list.some((w) => w.id === PLATFORM_TENANT_ID)) {
      list.unshift({
        id: PLATFORM_TENANT_ID,
        name: "Platform",
        slug: "platform",
        kind: "platform",
        home: true,
        plan: null,
        status: "ACTIVE",
        trial_ends: null,
        parent_agency_id: null,
        assessments: 0,
        created: new Date(0),
      });
    }
    return { count: list.length, workspaces: list };
  },
});

export const WORKSPACE_TOOLS: ToolDef[] = [connectionStatus, listWorkspaces];
