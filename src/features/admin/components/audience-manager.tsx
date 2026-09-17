"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateAudienceCanonical,
  renameAudienceValue,
  type AudienceUsageRow,
} from "@/features/admin/actions/audience-list";

/**
 * The Audiences screen: edit the tenant's canonical "default list" (which feeds the
 * free-text field's suggestions) and normalize the values respondents have already
 * typed — fix typos / map variants onto a canonical role, across every matching
 * submission at once. Both actions follow the acting scope on the server.
 */
export function AudienceManager({
  initialCanonical,
  rows,
  canonical,
}: {
  initialCanonical: string;
  rows: AudienceUsageRow[];
  canonical: string[];
}) {
  const router = useRouter();
  const [text, setText] = useState(initialCanonical);
  const [listMsg, setListMsg] = useState<string | null>(null);
  const [savingList, startSave] = useTransition();

  const saveList = () =>
    startSave(async () => {
      setListMsg(null);
      const r = await updateAudienceCanonical(text);
      setListMsg(r.ok ? "Default list saved." : r.error);
      if (r.ok) router.refresh();
    });

  const nonCanonical = rows.filter((r) => !r.canonical).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Default list editor */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-col gap-1">
          <Label className="text-sm font-medium">Default audience list</Label>
          <p className="text-xs text-[var(--muted-foreground)]">
            One role per line. These are the suggestions shown as respondents type in a free-text
            audience field, and the target values you normalize typed answers onto below. Blank lines
            and duplicates are dropped on save.
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={"Clinic owner\nDoctor\nDentist\nPhysiotherapist"}
          className="flex w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        />
        <div>
          <Button size="sm" onClick={saveList} disabled={savingList}>Save default list</Button>
        </div>
        {listMsg ? <p className="text-sm text-[var(--muted-foreground)]">{listMsg}</p> : null}
      </div>

      {/* Normalize typed values */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-col gap-1">
          <Label className="text-sm font-medium">Normalize submitted answers</Label>
          <p className="text-xs text-[var(--muted-foreground)]">
            Every distinct audience value stored on your submissions, most common first. Rename one to
            fix a typo or map a variant onto a canonical role — it updates every matching submission at
            once. To merge several variants, rename each to the same target.
            {nonCanonical > 0 ? (
              <span className="mt-1 block text-amber-600 dark:text-amber-400">
                🟡 {nonCanonical} value{nonCanonical === 1 ? "" : "s"} not in your default list.
              </span>
            ) : null}
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No audience values captured yet.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <NormalizeRow key={r.value} row={r} onDone={() => router.refresh()} />
              ))}
            </ul>
            {/* One shared datalist for every row's "Rename to…" field. */}
            <datalist id="audience-canonical-datalist">
              {canonical.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        )}
      </div>
    </div>
  );
}

function NormalizeRow({
  row,
  onDone,
}: {
  row: AudienceUsageRow;
  onDone: () => void;
}) {
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const apply = () =>
    start(async () => {
      setMsg(null);
      const r = await renameAudienceValue(row.value, to);
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setMsg(`Updated ${r.data?.updated ?? 0}.`);
      setTo("");
      onDone();
    });

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span className="min-w-[8rem] flex-1 text-sm">
        {row.value}
        {row.canonical ? (
          <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">🟢 in list</span>
        ) : (
          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">🟡 not in list</span>
        )}
      </span>
      <span className="text-xs text-[var(--muted-foreground)]">{row.count}×</span>
      <Input
        className="min-w-[10rem] flex-1"
        list="audience-canonical-datalist"
        placeholder="Rename to…"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
      <Button size="sm" variant="outline" onClick={apply} disabled={pending || !to.trim()}>
        Apply
      </Button>
      {msg ? <span className="w-full text-xs text-[var(--muted-foreground)]">{msg}</span> : null}
    </li>
  );
}
