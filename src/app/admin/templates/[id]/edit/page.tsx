import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin, isStaff } from "@/lib/auth/guards";
import { getTemplateDocument } from "@/features/templates/actions/templates";
import { templateDocSchema } from "@/features/templates/schema";
import { TemplateBuilder } from "@/features/templates/components/template-builder";

/**
 * Edit one template in the builder.
 *
 * Owner-only to CHANGE, super-admin to read, exactly as the library screen is: the
 * actions check again on the server, because a disabled control is not a permission.
 *
 * The document is validated here rather than in the browser. A template whose stored
 * body this app cannot read must not open in a builder that would then save a
 * half-understood version of it over the original - it goes to the JSON editor, which
 * shows the owner what is actually in there.
 */
export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSuperAdmin();
  const res = await getTemplateDocument(id);
  if (!res.ok || !res.data) notFound();

  let raw: unknown;
  try {
    raw = JSON.parse(res.data.json);
  } catch {
    raw = null;
  }
  const parsed = templateDocSchema.safeParse(raw);

  if (!parsed.success) {
    const issue = parsed.error?.issues[0];
    const where = issue?.path?.length ? ` at ${issue.path.join(".")}` : "";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight">This template cannot open in the builder</h1>
        <p className="rounded-lg border border-yellow-600/40 bg-yellow-600/5 p-3 text-sm">
          🟡 Its stored content does not match what this app understands: {issue?.message ?? "invalid"}
          {where}. The builder is not shown, because saving from it could write a half-understood version
          over the original. Open it as JSON to see exactly what is in there.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={`/admin/templates?json=${id}`} className="underline">
            Edit as JSON
          </Link>
          <Link href="/admin/templates" className="underline">
            Back to the template library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit template</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          The same steps as the funnel builder, opened on this template. Nothing is imported and no
          assessment is created: every change is saved onto the template itself.
        </p>
      </div>
      <TemplateBuilder
        id={res.data.id}
        initialDoc={parsed.data}
        builtin={res.data.builtin}
        seedLocked={res.data.seedLocked}
        canEdit={!isStaff(user)}
      />
    </div>
  );
}
