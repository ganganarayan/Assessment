import { listContacts } from "@/features/admin/data/analytics";

export const dynamic = "force-dynamic";

const UTM = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
] as const;

const tick = (v: boolean) => (v ? "✓" : "—");

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const requested = Math.max(1, Number(sp.page ?? "1") || 1);
  const pageSize = 50;
  const { rows, total, page, pages } = await listContacts({ page: requested, pageSize });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {total.toLocaleString()} opt-ins. Ticks = opted in · completed · VSL loaded (result shown).
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No contacts yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-1.5">Contact</th>
                <th className="px-3 py-1.5 text-center">Opt-in</th>
                <th className="px-3 py-1.5 text-center">Completed</th>
                <th className="px-3 py-1.5 text-center">VSL</th>
                {UTM.map((u) => (
                  <th key={u} className="whitespace-nowrap px-3 py-1.5">{u}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}
                      </span>
                      <span className="text-xs text-[var(--muted-foreground)]">{r.email ?? "—"}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">{r.mobile ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-green-600">✓</td>
                  <td className="px-3 py-2 text-center">{tick(r.completed)}</td>
                  <td className="px-3 py-2 text-center">{tick(r.vslLoaded)}</td>
                  {UTM.map((u) => (
                    <td key={u} className="whitespace-nowrap px-3 py-2 text-xs">
                      {r.attribution?.[u] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center gap-4 text-sm">
          {page > 1 ? <a className="underline" href={`?page=${page - 1}`}>← Prev</a> : <span />}
          <span className="text-[var(--muted-foreground)]">Page {page} of {pages}</span>
          {page < pages ? <a className="underline" href={`?page=${page + 1}`}>Next →</a> : null}
        </div>
      ) : null}
    </div>
  );
}
