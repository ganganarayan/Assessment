import "server-only";
import { graph } from "@/lib/whatsapp/graph";
import type { TemplateDraft } from "@/features/wa-templates/types";

/**
 * Submitting a message template to Meta, and asking what became of it.
 *
 * Two calls, both on the WABA (the WhatsApp Business Account) rather than the phone
 * number: a template belongs to the account, and the same template is sendable from
 * every number under it.
 *
 *   POST /{wabaId}/message_templates    submit for review
 *   GET  /{wabaId}/message_templates    what Meta says about them now
 *
 * 🔴 SUBMISSION IS NOT REVERSIBLE AND REVIEW IS NOT FAST. Meta queues the template,
 * takes anywhere from a minute to a day, and a rejection counts against the account's
 * standing if it happens often. That is why everything checkable is checked before we
 * get here, in features/wa-templates/types.ts, and why a draft exists at all.
 */

interface CreatedTemplate {
  id?: string;
  status?: string;
  category?: string;
}

interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER";
  format?: "TEXT";
  text: string;
  example?: { header_text?: string[]; body_text?: string[][] };
}

/**
 * The components array Meta wants.
 *
 * 🔴 THE EXAMPLE SHAPE IS THE PART EVERYBODY GETS WRONG. body_text is an array
 * CONTAINING ONE ARRAY of samples - [["Ravi", "3 pm"]], not ["Ravi", "3 pm"]. The outer
 * array is Meta's notion of multiple example sets. Send the flat version and the
 * template is rejected for having no examples, which is not what the error says.
 */
export function templateComponents(d: TemplateDraft, varCount: number): TemplateComponent[] {
  const out: TemplateComponent[] = [];
  const header = d.headerText.trim();
  if (header) out.push({ type: "HEADER", format: "TEXT", text: header });
  const body: TemplateComponent = { type: "BODY", text: d.bodyText.trim() };
  if (varCount > 0) {
    body.example = { body_text: [d.sampleValues.slice(0, varCount).map((v) => v.trim())] };
  }
  out.push(body);
  const footer = d.footerText.trim();
  if (footer) out.push({ type: "FOOTER", text: footer });
  return out;
}

/** Submit one template for review. */
export async function submitTemplate(args: {
  wabaId: string;
  token: string;
  apiVersion: string;
  draft: TemplateDraft;
  varCount: number;
}): Promise<{ ok: true; metaId: string | null; status: string | null } | { ok: false; error: string }> {
  const res = await graph<CreatedTemplate>(`${args.apiVersion}/${args.wabaId}/message_templates`, {
    method: "POST",
    token: args.token,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: args.draft.name.trim(),
      language: args.draft.language.trim(),
      category: args.draft.category,
      components: templateComponents(args.draft, args.varCount),
    }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, metaId: res.data?.id ?? null, status: res.data?.status ?? null };
}

interface ListedTemplate {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  rejected_reason?: string;
}

/**
 * What Meta currently says about every template on the account.
 *
 * Keyed by name and language together, because that is Meta's own key and the same
 * name legitimately exists once per language.
 */
export async function listTemplateStatuses(args: {
  wabaId: string;
  token: string;
  apiVersion: string;
}): Promise<
  | { ok: true; byKey: Map<string, { id: string | null; status: string; rejectedReason: string | null }> }
  | { ok: false; error: string }
> {
  const res = await graph<{ data?: ListedTemplate[] }>(
    `${args.apiVersion}/${args.wabaId}/message_templates?fields=id,name,language,status,category,rejected_reason&limit=500`,
    { method: "GET", token: args.token },
  );
  if (!res.ok) return { ok: false, error: res.error };
  const byKey = new Map<string, { id: string | null; status: string; rejectedReason: string | null }>();
  for (const t of res.data?.data ?? []) {
    if (!t.name) continue;
    byKey.set(`${t.name}::${t.language ?? ""}`, {
      id: t.id ?? null,
      status: (t.status ?? "").toUpperCase(),
      // Meta sends the literal string "NONE" when there is nothing to report, which is
      // worse than useless in front of an owner reading a rejection reason.
      rejectedReason:
        t.rejected_reason && t.rejected_reason.toUpperCase() !== "NONE" ? t.rejected_reason : null,
    });
  }
  return { ok: true, byKey };
}
