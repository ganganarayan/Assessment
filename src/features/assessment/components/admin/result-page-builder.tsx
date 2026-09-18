"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  RESULT_BLOCK_TYPES,
  RESULT_THEMES,
  defaultResultConfig,
  type ResultPageData,
  type ResultBlock,
  type ResultBlockType,
  type ThemeKey,
  type TextAlign,
} from "@/features/assessment/result-page/blocks";
import { saveResultPage, publishResultPage, unpublishResultPage } from "@/features/assessment/actions/result-page";
import { VslResultPage } from "@/features/assessment/components/public/vsl-result-page";

/**
 * Basic VSL result-page builder. The whole page (theme + ordered blocks) is one JSON
 * blob edited in local state; structural changes persist immediately and text fields
 * persist on blur. Publish snapshots the draft to the live page the token URL renders.
 */
export function ResultPageBuilder({
  assessmentId,
  initial,
  initialPublished,
  lastPublishedAt,
}: {
  assessmentId: string;
  initial: ResultPageData;
  initialPublished: boolean;
  lastPublishedAt: string | null;
}) {
  const [page, setPage] = useState<ResultPageData>(initial);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [pending, start] = useTransition();
  const [dirtyPub, setDirtyPub] = useState(false);
  const [isLive, setIsLive] = useState(initialPublished);
  const [publishedAt, setPublishedAt] = useState<string | null>(lastPublishedAt);

  const update = (next: ResultPageData) => {
    pageRef.current = next;
    setPage(next);
    setDirtyPub(true);
  };
  const persist = () =>
    start(async () => {
      await saveResultPage(assessmentId, pageRef.current);
    });
  /** Apply a change and persist it immediately (for structural edits). */
  const commit = (next: ResultPageData) => {
    update(next);
    start(async () => {
      await saveResultPage(assessmentId, next);
    });
  };

  const setBlockConfig = (id: string, config: Record<string, unknown>) =>
    update({ ...page, blocks: page.blocks.map((b) => (b.id === id ? { ...b, config } : b)) });

  const addBlock = (type: ResultBlockType) =>
    commit({
      ...page,
      blocks: [...page.blocks, { id: crypto.randomUUID(), type, config: defaultResultConfig(type) }],
    });

  const removeBlock = (id: string) => commit({ ...page, blocks: page.blocks.filter((b) => b.id !== id) });

  const moveBlock = (id: string, dir: "up" | "down") => {
    const i = page.blocks.findIndex((b) => b.id === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= page.blocks.length) return;
    const blocks = [...page.blocks];
    const a = blocks[i];
    const b = blocks[j];
    if (!a || !b) return;
    blocks[i] = b;
    blocks[j] = a;
    commit({ ...page, blocks });
  };

  const publish = () =>
    start(async () => {
      await saveResultPage(assessmentId, pageRef.current);
      const r = await publishResultPage(assessmentId);
      if (r.ok && r.data) {
        setDirtyPub(false);
        setIsLive(true);
        setPublishedAt(r.data.publishedAt);
      } else if (!r.ok) {
        alert(r.error);
      }
    });

  const unpublish = () =>
    start(async () => {
      const r = await unpublishResultPage(assessmentId);
      if (r.ok) {
        setIsLive(false);
        setPublishedAt(null);
        setDirtyPub(true);
      }
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Status + publish bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-[var(--muted)]/30 p-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {!isLive
              ? "Unpublished — the result page falls back to the default score cards"
              : dirtyPub
                ? "Draft has unpublished changes"
                : "Published — live version is up to date"}
          </span>
          <span className="text-xs text-[var(--muted-foreground)]">
            {pending ? "Saving draft…" : "Edits auto-save as a draft. Click Publish to make them live."}
            {publishedAt ? ` · Last published ${new Date(publishedAt).toLocaleString()}` : " · Not live"}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isLive ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (confirm("Unpublish the result page? Respondents will see the default score cards instead. Your draft is kept.")) unpublish();
              }}
              className="border-red-500 text-red-600 hover:bg-red-500/10"
            >
              Unpublish
            </Button>
          ) : null}
          <Button disabled={pending || (!dirtyPub && isLive)} onClick={publish}>
            {isLive && !dirtyPub ? "Published ✓" : "Publish changes"}
          </Button>
        </div>
      </div>

      {/* Live preview — reflects the current draft (blank until you add blocks). The
          respondent's real AI statement is substituted here with placeholder text. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Preview</span>
        <div className="overflow-hidden rounded-lg border">
          <div className="max-h-[560px] overflow-y-auto">
            <VslResultPage
              page={page}
              aiStatement={"[ The respondent's personalized AI statement appears here. ]"}
              customerId={null}
              vidapulseParam={null}
            />
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <Label className="text-sm font-medium">Color scheme</Label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(RESULT_THEMES) as ThemeKey[]).map((key) => {
            const { label, theme } = RESULT_THEMES[key];
            const active = page.theme === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => commit({ ...page, theme: key })}
                className={`flex items-center gap-2 rounded-md border p-2 text-xs ${active ? "border-emerald-500 ring-1 ring-emerald-500" : "border-[var(--border)]"}`}
              >
                <span className="flex gap-1">
                  <span className="h-5 w-5 rounded" style={{ background: theme.bg, border: "1px solid #0002" }} />
                  <span className="h-5 w-5 rounded" style={{ background: theme.cta }} />
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Blocks */}
      {page.blocks.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No blocks yet. Add an eyebrow, headline, the AI statement, your VSL video, buttons and
          testimonials below.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {page.blocks.map((block, i) => (
          <BlockEditor
            key={block.id}
            block={block}
            first={i === 0}
            last={i === page.blocks.length - 1}
            pending={pending}
            onChange={(cfg) => setBlockConfig(block.id, cfg)}
            onBlur={persist}
            onMove={(dir) => moveBlock(block.id, dir)}
            onDelete={() => removeBlock(block.id)}
          />
        ))}
      </div>

      <AddBlock pending={pending} onAdd={addBlock} />
    </div>
  );
}

function AddBlock({ pending, onAdd }: { pending: boolean; onAdd: (type: ResultBlockType) => void }) {
  const [type, setType] = useState<ResultBlockType>("headline");
  return (
    <div className="flex items-center gap-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as ResultBlockType)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
      >
        {RESULT_BLOCK_TYPES.map((b) => (
          <option key={b.type} value={b.type}>{b.label}</option>
        ))}
      </select>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => onAdd(type)}>+ Add block</Button>
    </div>
  );
}

const ALIGNS: TextAlign[] = ["left", "center", "right"];

function BlockEditor({
  block,
  first,
  last,
  pending,
  onChange,
  onBlur,
  onMove,
  onDelete,
}: {
  block: ResultBlock;
  first: boolean;
  last: boolean;
  pending: boolean;
  onChange: (config: Record<string, unknown>) => void;
  onBlur: () => void;
  onMove: (dir: "up" | "down") => void;
  onDelete: () => void;
}) {
  const c = block.config ?? {};
  const label = RESULT_BLOCK_TYPES.find((b) => b.type === block.type)?.label ?? block.type;
  const set = (patch: Record<string, unknown>) => onChange({ ...c, ...patch });
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">{label}</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" disabled={pending || first} onClick={() => onMove("up")}>↑</Button>
          <Button size="sm" variant="outline" disabled={pending || last} onClick={() => onMove("down")}>↓</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={onDelete} className="border-red-500 text-red-600 hover:bg-red-500/10">✕</Button>
        </div>
      </div>

      {block.type === "eyebrow" || block.type === "headline" || block.type === "subhead" ? (
        <Textarea rows={block.type === "headline" ? 2 : 1} placeholder={label} value={str(c.text)} onChange={(e) => set({ text: e.target.value })} onBlur={onBlur} />
      ) : null}

      {block.type === "ai_statement" ? (
        <>
          <p className="text-xs text-[var(--muted-foreground)]">
            Shows this respondent&apos;s AI statement (pulled from the assessment). Optional fallback for
            when a respondent has none:
          </p>
          <Textarea rows={2} placeholder="Fallback text (optional)" value={str(c.fallback)} onChange={(e) => set({ fallback: e.target.value })} onBlur={onBlur} />
        </>
      ) : null}

      {block.type === "text" ? (
        <>
          <Textarea rows={3} placeholder="Paragraph text" value={str(c.text)} onChange={(e) => set({ text: e.target.value })} onBlur={onBlur} />
          <AlignPicker value={c.align} onPick={(a) => { set({ align: a }); onBlur(); }} />
        </>
      ) : null}

      {block.type === "button" ? (
        <div className="flex flex-col gap-2">
          <Input placeholder="Button text" value={str(c.label)} onChange={(e) => set({ label: e.target.value })} onBlur={onBlur} />
          <Input placeholder="Link URL (https://…)" value={str(c.url)} onChange={(e) => set({ url: e.target.value })} onBlur={onBlur} />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Background colour
              <Input placeholder="theme default" value={str(c.bg)} onChange={(e) => set({ bg: e.target.value })} onBlur={onBlur} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Text colour
              <Input placeholder="theme default" value={str(c.color)} onChange={(e) => set({ color: e.target.value })} onBlur={onBlur} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Font size (px)
              <Input type="number" placeholder="18" value={num(c.fontSize) ?? ""} onChange={(e) => set({ fontSize: e.target.value === "" ? undefined : Number(e.target.value) })} onBlur={onBlur} />
            </label>
            <div className="flex flex-col gap-1 text-xs">
              Alignment
              <AlignPicker value={c.align} onPick={(a) => { set({ align: a }); onBlur(); }} />
            </div>
          </div>
        </div>
      ) : null}

      {block.type === "video" ? (
        <>
          <p className="text-xs text-[var(--muted-foreground)]">Paste the VSL video embed code (e.g. from VidaPulse). Only the iframe is used.</p>
          <Textarea rows={3} placeholder='<iframe src="…"></iframe>' value={str(c.embedCode)} onChange={(e) => set({ embedCode: e.target.value })} onBlur={onBlur} spellCheck={false} />
        </>
      ) : null}

      {block.type === "testimonials" ? (
        <TestimonialsEditor c={c} set={set} onBlur={onBlur} pending={pending} />
      ) : null}

      {block.type === "footer" ? (
        <FooterEditor c={c} set={set} onBlur={onBlur} pending={pending} />
      ) : null}
    </div>
  );
}

function AlignPicker({ value, onPick }: { value: unknown; onPick: (a: TextAlign) => void }) {
  const cur = value === "left" || value === "right" ? value : "center";
  return (
    <div className="flex gap-1">
      {ALIGNS.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onPick(a)}
          className={`rounded-md border px-2 py-1 text-xs capitalize ${cur === a ? "border-emerald-500 bg-emerald-500/10" : "border-[var(--border)]"}`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

type Item = { url?: string; name?: string; role?: string };
function TestimonialsEditor({
  c,
  set,
  onBlur,
  pending,
}: {
  c: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  onBlur: () => void;
  pending: boolean;
}) {
  const items: Item[] = Array.isArray(c.items) ? (c.items as Item[]) : [];
  const setItem = (i: number, patch: Partial<Item>) =>
    set({ items: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return (
    <div className="flex flex-col gap-3">
      <Input placeholder="Section heading (optional)" value={str(c.heading)} onChange={(e) => set({ heading: e.target.value })} onBlur={onBlur} />
      {items.map((it, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-md border p-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted-foreground)]">Testimonial {i + 1}</span>
            <Button size="sm" variant="ghost" disabled={pending} className="ml-auto" onClick={() => { set({ items: items.filter((_, idx) => idx !== i) }); onBlur(); }}>✕</Button>
          </div>
          <Input placeholder="YouTube link" value={str(it.url)} onChange={(e) => setItem(i, { url: e.target.value })} onBlur={onBlur} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Name" value={str(it.name)} onChange={(e) => setItem(i, { name: e.target.value })} onBlur={onBlur} />
            <Input placeholder="Role" value={str(it.role)} onChange={(e) => setItem(i, { role: e.target.value })} onBlur={onBlur} />
          </div>
        </div>
      ))}
      <div>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => { set({ items: [...items, { url: "", name: "", role: "" }] }); onBlur(); }}>+ Add testimonial</Button>
      </div>
    </div>
  );
}

type Lnk = { label?: string; url?: string };
function FooterEditor({
  c,
  set,
  onBlur,
  pending,
}: {
  c: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  onBlur: () => void;
  pending: boolean;
}) {
  const links: Lnk[] = Array.isArray(c.links) ? (c.links as Lnk[]) : [];
  const setLink = (i: number, patch: Partial<Lnk>) =>
    set({ links: links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return (
    <div className="flex flex-col gap-3">
      <Label className="text-xs">Footer links</Label>
      {links.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input className="max-w-[10rem]" placeholder="Label" value={str(l.label)} onChange={(e) => setLink(i, { label: e.target.value })} onBlur={onBlur} />
          <Input placeholder="URL" value={str(l.url)} onChange={(e) => setLink(i, { url: e.target.value })} onBlur={onBlur} />
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { set({ links: links.filter((_, idx) => idx !== i) }); onBlur(); }}>✕</Button>
        </div>
      ))}
      <div>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => { set({ links: [...links, { label: "", url: "" }] }); onBlur(); }}>+ Add link</Button>
      </div>
      <Textarea rows={3} placeholder="Disclaimer (optional)" value={str(c.disclaimer)} onChange={(e) => set({ disclaimer: e.target.value })} onBlur={onBlur} />
      <Input placeholder="Copyright line (optional)" value={str(c.copyright)} onChange={(e) => set({ copyright: e.target.value })} onBlur={onBlur} />
    </div>
  );
}
