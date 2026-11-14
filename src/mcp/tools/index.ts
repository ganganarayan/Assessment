import "server-only";
import type { ToolDef } from "@/mcp/core/types";
import { WORKSPACE_TOOLS } from "@/mcp/tools/workspace";
import { ASSESSMENT_TOOLS } from "@/mcp/tools/assessments";
import { STATS_TOOLS } from "@/mcp/tools/stats";
import { LEAD_TOOLS } from "@/mcp/tools/leads";
import { TEMPLATE_TOOLS } from "@/mcp/tools/templates";
import { ACTION_TOOLS } from "@/mcp/tools/actions";

/** Every MCP tool, in the order tools/list shows them. */
export const TOOLS: readonly ToolDef[] = [
  ...WORKSPACE_TOOLS,
  ...ASSESSMENT_TOOLS,
  ...STATS_TOOLS,
  ...LEAD_TOOLS,
  ...TEMPLATE_TOOLS,
  ...ACTION_TOOLS,
];
