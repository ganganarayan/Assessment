/** One server action the MCP action bridge may run (see scripts/gen-mcp-actions.ts). */
export interface CatalogEntry {
  /** area.fn, e.g. assessment.question.createQuestion */
  id: string;
  /** import path, e.g. @/features/assessment/actions/question */
  module: string;
  fn: string;
  file: string;
  kind: "read" | "write";
  destructive: boolean;
  params: { name: string; type: string; optional: boolean; fields?: { name: string; type: string; optional: boolean; doc?: string }[] }[];
  returns: string;
  doc: string;
}
