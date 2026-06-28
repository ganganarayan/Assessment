"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BLOCK_TYPES,
  BAND_LEVELS,
  type AssessmentPageData,
  type PageBlockData,
  type BlockType,
} from "@/features/assessment/pages/blocks";
import {
  addPage,
  deletePage,
  updatePageTitle,
  addBlock,
  updateBlockConfig,
  deleteBlock,
  moveBlock,
  publishPages,
} from "@/features/assessment/actions/pages";

/**
 * Post-assessment page builder. Add pages, add typed blocks, edit each block's
 * config, reorder, remove. Every action returns the fresh page list. Block config
 * edits are local while typing and persisted on blur.
 */
export function PagesBuilder({
  assessmentId,
  initialPages,
  bandTitles,
  initialDirty,
  lastPublishedAt,
}: {
  assessmentId: string;
  initialPages: AssessmentPageData[];
  bandTitles: Record<string, string>; // level -> your word (Stable / Overwhelmed / …)
  initialDirty: boolean;
  lastPublishedAt: string | null;
}) {
  const [pages, setPages] = useState<AssessmentPageData[]>(initialPages);
  const [pending, start] = useTransition();
  // Draft auto-saves; "dirty" = draft differs from the published (live) version.
  const [dirtyPub, setDirtyPub] = useState(initialDirty);
  const [publishedAt, setPublishedAt] = useState<string | null>(lastPublishedAt);
  // Block configs being typed but not yet saved. When any action returns the fresh
  // list, we overlay these so an in-progress edit in another block isn't wiped.
  const dirty = useRef<Record<string, Record<string, unknown>>>({});

  const applyServer = (list: AssessmentPageData[]) =>
    setPages(
      list.map((p) => ({
        ...p,
        blocks: p.blocks.map((b) => {
          const d = dirty.current[b.id];
          return d ? { ...b, config: d } : b;
        }),
      })),
    );

  const run = (fn: () => Promise<{ ok: boolean; data?: AssessmentPageData[]; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok && r.data) {
        applyServer(r.data);
        setDirtyPub(true); // draft changed; needs Publish to go live
      }
    });

  const publish = () =>
    start(async () => {
      const r = await publishPages(assessmentId);
      if (r.ok && r.data) {
        setDirtyPub(false);
        setPublishedAt(r.data.publishedAt);
      }
    });

  const setBlockLocal = (blockId: string, config: Record<string, unknown>) => {
    dirty.current[blockId] = config; // mark dirty until its save confirms
    setPages((ps) => ps.map((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === blockId ? { ...b, config } : b)) })));
  };

  const saveBlock = (blockId: string, config: Record<string, unknown>) =>
    start(async () => {
      const r = await updateBlockConfig(blockId, config);
      delete dirty.current[blockId]; // saved — let server state win from here
      if (r.ok && r.data) {
        applyServer(r.data);
        setDirtyPub(true);
      }
    });

  const setPageTitleLocal = (pageId: string, title: string) =>
    setPages((ps) => ps.map((p) => (p.id === pageId ? { ...p, title } : p)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-[var(--muted)]/30 p-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {dirtyPub ? "Draft has unpublished changes" : "Published — live version is up to date"}
          </span>
          <span className="text-xs text-[var(--muted-foreground)]">
            {pending ? "Saving draft…" : "Edits auto-save as a draft. Click Publish to make them live."}
            {publishedAt ? ` · Last published ${new Date(publishedAt).toLocaleString()}` : " · Never published"}
          </span>
        </div>
        <div className="ml-auto">
          <Button disabled={pending || !dirtyPub} onClick={publish}>
            {dirtyPub ? "Publish changes" : "Published ✓"}
          </Button>
        </div>
      </div>

      {pages.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No pages yet. Add a page to show a results step after the assessment (overall band, a
          sentence, blurred category breakdown, a write-up, video, and a payment button).
        </p>
      ) : null}

      {pages.map((page, pi) => (
        <div key={page.id} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--muted-foreground)]">Page {pi + 1}</span>
            <Input
              value={page.title ?? ""}
              placeholder="Page title (internal)"
              className="h-8 max-w-xs"
              onChange={(e) => setPageTitleLocal(page.id, e.target.value)}
              onBlur={(e) => run(() => updatePageTitle(page.id, e.target.value))}
            />
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => { if (confirm("Delete this page and its blocks?")) run(() => deletePage(page.id)); }} className="border-red-500 text-red-600 hover:bg-red-500/10">Delete page</Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-l-2 pl-4">
            {page.blocks.map((block, bi) => (
              <BlockEditor
                key={block.id}
                block={block}
                bandTitles={bandTitles}
                first={bi === 0}
                last={bi === page.blocks.length - 1}
                pending={pending}
                onChange={(cfg) => setBlockLocal(block.id, cfg)}
                onSave={(cfg) => saveBlock(block.id, cfg)}
                onMove={(dir) => run(() => moveBlock(block.id, dir))}
                onDelete={() => run(() => deleteBlock(block.id))}
              />
            ))}
            <AddBlock pending={pending} onAdd={(type) => run(() => addBlock(page.id, type))} />
          </div>
        </div>
      ))}

      {pages.length === 0 ? (
        <div>
          <Button disabled={pending} onClick={() => run(() => addPage(assessmentId))}>
            + Add results page
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AddBlock({ pending, onAdd }: { pending: boolean; onAdd: (type: BlockType) => void }) {
  const [type, setType] = useState<BlockType>("text");
  return (
    <div className="flex items-center gap-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value as BlockType)}
        className="h-8 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
      >
        {BLOCK_TYPES.map((b) => (
          <option key={b.type} value={b.type}>{b.label}</option>
        ))}
      </select>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => onAdd(type)}>+ Add block</Button>
    </div>
  );
}

function BlockEditor({
  block,
  bandTitles,
  first,
  last,
  pending,
  onChange,
  onSave,
  onMove,
  onDelete,
}: {
  block: PageBlockData;
  bandTitles: Record<string, string>;
  first: boolean;
  last: boolean;
  pending: boolean;
  onChange: (config: Record<string, unknown>) => void;
  onSave: (config: Record<string, unknown>) => void;
  onMove: (dir: "up" | "down") => void;
  onDelete: () => void;
}) {
  const c = block.config ?? {};
  const label = BLOCK_TYPES.find((b) => b.type === block.type)?.label ?? block.type;
  const set = (patch: Record<string, unknown>) => {
    const next = { ...c, ...patch };
    onChange(next);
    return next;
  };
  const str = (v: unknown) => (typeof v === "string" ? v : "");

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

      {block.type === "text" ? (
        <>
          <Input placeholder="Heading (optional)" value={str(c.heading)} onChange={(e) => set({ heading: e.target.value })} onBlur={() => onSave(c)} />
          <Textarea placeholder="Text content" value={str(c.content)} rows={3} onChange={(e) => set({ content: e.target.value })} onBlur={() => onSave(c)} />
        </>
      ) : null}

      {block.type === "video" ? (
        <Input placeholder="Video embed URL (VidaPulse)" value={str(c.embedUrl)} onChange={(e) => set({ embedUrl: e.target.value })} onBlur={() => onSave(c)} />
      ) : null}

      {block.type === "pay_button" ? (
        <Input placeholder="Button label" value={str(c.label)} onChange={(e) => set({ label: e.target.value })} onBlur={() => onSave(c)} />
      ) : null}

      {block.type === "overall_band" ? (
        <Input placeholder="Prefix (e.g. Your result:)" value={str(c.prefix)} onChange={(e) => set({ prefix: e.target.value })} onBlur={() => onSave(c)} />
      ) : null}

      {block.type === "band_sentence" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--muted-foreground)]">A sentence per overall band — shown to whoever lands in that band.</p>
          {BAND_LEVELS.map((lvl) => {
            const byBand = (c.byBand ?? {}) as Record<string, string>;
            return (
              <div key={lvl} className="flex flex-col gap-1">
                <Label className="text-xs">{bandTitles[lvl] ? `${bandTitles[lvl]} (${lvl})` : lvl}</Label>
                <Textarea
                  rows={2}
                  value={str(byBand[lvl])}
                  onChange={(e) => set({ byBand: { ...byBand, [lvl]: e.target.value } })}
                  onBlur={() => onSave(c)}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      {block.type === "category_scores" ? (
        <Input placeholder="Heading (optional)" value={str(c.heading)} onChange={(e) => set({ heading: e.target.value })} onBlur={() => onSave(c)} />
      ) : null}
    </div>
  );
}
