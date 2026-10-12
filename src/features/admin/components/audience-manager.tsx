"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAudienceList,
  updateAudienceList,
  setDefaultAudienceList,
  deleteAudienceList,
  renameAudienceValue,
  type AudienceListRow,
  type AudienceUsageRow,
} from "@/features/admin/actions/audience-list";

/**
 * The Audiences screen: keep as many NAMED lists of roles as the work needs, edit any
 * of them at any time, and normalize the values respondents have already typed.
 *
 * A list is picked here and then picked again in the assessment builder, which is why
 * the two halves of this screen are a picker and an editor rather than one textarea:
 * the thing being edited has to be identifiable from somewhere else.
 */
export function AudienceManager({
  lists,
  rows,
  canonical,
}: {
  lists: AudienceListRow[];
  rows: AudienceUsageRow[];
  canonical: string[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(lists[0]?.id ?? "");

  // After a save the server component re-renders with fresh lists. Keep the selection
  // pointing at a list that still exists (it may have just been deleted) without
  // throwing away a selection the person made.
  useEffect(() => {
    const first = lists[0];
    if (!first) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!lists.some((l) => l.id === selectedId)) setSelectedId(first.id);
  }, [lists, selectedId]);

  const selected = useMemo(() => lists.find((l) => l.id === selectedId) ?? null, [lists, selectedId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr]">
        <ListPicker
          lists={lists}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChanged={(id) => {
            if (id) setSelectedId(id);
            router.refresh();
          }}
        />
        {selected ? (
          <ListEditor key={selected.id} list={selected} onChanged={() => router.refresh()} />
        ) : (
          <div className="flex items-center justify-center rounded-lg border p-6 text-sm text-[var(--muted-foreground)]">
            No audience lists yet. Create one on the left, then pick it in an assessment.
          </div>
        )}
      </div>

      <Normalize rows={rows} canonical={canonical} onChanged={() => router.refresh()} />
    </div>
  );
}

/** The named lists, plus the one field that creates another. */
function ListPicker({
  lists,
  selectedId,
  onSelect,
  onChanged,
}: {
  lists: AudienceListRow[];
  selectedId: string;
  onSelect: (id: string) => void;
  onChanged: (newId?: string) => void;
}) {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      setMsg(null);
      const r = await createAudienceList(name);
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setName("");
      onChanged(r.data?.id);
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium">Your audience lists</Label>
        <p className="text-xs text-[var(--muted-foreground)]">
          Each assessment picks one of these. Pick a list here to edit it.
        </p>
      </div>

      {lists.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {lists.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onSelect(l.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--muted)]/60 ${
                  l.id === selectedId ? "border-emerald-500 bg-emerald-500/10" : "border-[var(--border)]"
                }`}
              >
                <span className="min-w-0 truncate">
                  {l.name}
                  {l.isDefault ? (
                    <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">default</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{l.items.length}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
        <Label htmlFor="newAudienceList" className="text-xs">
          New list
        </Label>
        <div className="flex gap-2">
          <Input
            id="newAudienceList"
            className="min-w-0 flex-1"
            placeholder="e.g. Clinic roles"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button size="sm" onClick={create} disabled={pending || !name.trim()}>
            Add
          </Button>
        </div>
        {msg ? <p className="text-xs text-amber-600 dark:text-amber-400">🟡 {msg}</p> : null}
      </div>
    </div>
  );
}

/** Name + labels of the selected list, saved together. */
function ListEditor({ list, onChanged }: { list: AudienceListRow; onChanged: () => void }) {
  const [name, setName] = useState(list.name);
  const [text, setText] = useState(list.items.join("\n"));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = name !== list.name || text !== list.items.join("\n");

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await updateAudienceList(list.id, text, name);
      setMsg(r.ok ? "Saved." : r.error);
      if (r.ok) onChanged();
    });

  const makeDefault = () =>
    start(async () => {
      setMsg(null);
      const r = await setDefaultAudienceList(list.id);
      setMsg(r.ok ? "This is now the default list." : r.error);
      if (r.ok) onChanged();
    });

  const remove = () =>
    start(async () => {
      setMsg(null);
      const r = await deleteAudienceList(list.id);
      if (!r.ok) {
        setConfirmDelete(false);
        setMsg(r.error);
        return;
      }
      onChanged();
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-2">
          <Label htmlFor="audienceListName">List name{dirty ? " *" : ""}</Label>
          <Input id="audienceListName" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {list.isDefault ? (
          <p className="pb-2 text-xs text-emerald-600 dark:text-emerald-400">
            🟢 Default - used when an assessment picks no list.
          </p>
        ) : (
          <Button size="sm" variant="outline" onClick={makeDefault} disabled={pending}>
            Make default
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="audienceListItems">Roles in this list</Label>
        <p className="text-xs text-[var(--muted-foreground)]">
          One role per line. These are the suggestions shown as respondents type in a free-text
          audience field on any assessment using this list, and the targets you normalize typed
          answers onto below. Blank lines and duplicates are dropped on save.
        </p>
        <textarea
          id="audienceListItems"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={"Clinic owner\nDoctor\nDentist\nPhysiotherapist"}
          className="flex w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={pending || !name.trim()}>
          Save list
        </Button>
        {confirmDelete ? (
          <>
            <span className="text-xs text-[var(--muted-foreground)]">Delete {list.name}?</span>
            <Button
              size="sm"
              variant="outline"
              onClick={remove}
              disabled={pending}
              className="border-red-500 text-red-600 hover:bg-red-500/10"
            >
              Yes, delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={pending}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={pending}>
            Delete list
          </Button>
        )}
        {msg ? <span className="text-sm text-[var(--muted-foreground)]">{msg}</span> : null}
      </div>
    </div>
  );
}

/** Clean up what respondents actually typed, against every list pooled together. */
function Normalize({
  rows,
  canonical,
  onChanged,
}: {
  rows: AudienceUsageRow[];
  canonical: string[];
  onChanged: () => void;
}) {
  const nonCanonical = rows.filter((r) => !r.canonical).length;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium">Normalize submitted answers</Label>
        <p className="text-xs text-[var(--muted-foreground)]">
          Every distinct audience value stored on your submissions, most common first. Rename one to
          fix a typo or map a variant onto a role you keep - it updates every matching submission at
          once. To merge several variants, rename each to the same target. Matching is checked
          against all your lists together, since a submission records the value typed, not the list
          it came from.
          {nonCanonical > 0 ? (
            <span className="mt-1 block text-amber-600 dark:text-amber-400">
              🟡 {nonCanonical} value{nonCanonical === 1 ? "" : "s"} not in any of your lists.
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
              <NormalizeRow key={r.value} row={r} onDone={onChanged} />
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
          <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">🟢 in a list</span>
        ) : (
          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">🟡 not in a list</span>
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
