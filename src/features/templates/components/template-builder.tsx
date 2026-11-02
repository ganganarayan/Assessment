"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateTemplateDocument } from "@/features/templates/actions/templates";
import { TEMPLATE_SHAPES, SHAPE_LABELS, SHAPE_HINTS, TEMPLATE_CATEGORIES, type TemplateDoc } from "@/features/templates/schema";
import { settingsFromBody, settingsToBody } from "@/features/templates/builder-doc";
import type { AssessmentBodyExport } from "@/features/assessment/transfer/schema";
import type { AssessmentInput } from "@/features/assessment/schemas";
import { AssessmentForm } from "@/features/assessment/components/admin/assessment-form";
import {
  BuilderStep,
  BuilderStepNav,
  BuilderStepRail,
  BuilderTabProvider,
  TEMPLATE_BUILDER_TABS,
  TEMPLATE_STEP_KEYS,
  useBuilderTab,
} from "@/features/admin/components/builder-tab-context";
import { TemplateQuestionsEditor } from "@/features/templates/components/template-questions-editor";
import { TemplateBandsEditor } from "@/features/templates/components/template-bands-editor";
import { TemplateGateEditor } from "@/features/templates/components/template-gate-editor";
import { SELECT_CLASS, Field } from "@/features/templates/components/template-editor-shared";

/**
 * The template builder: the real builder's steps, opened on a template document.
 *
 * NO IMPORT, NO DRAFT ROW, NOTHING TO CLEAN UP. The whole document lives in this
 * component's state and is saved through the SAME action the JSON editor uses, so it
 * passes the same schema, refuses a slug change in the same place, and sets `seedLocked`
 * on a built-in in the same place. There is one save path for a template, not two.
 *
 * WHO EDITS WHAT:
 *  - The settings steps are AssessmentForm itself, in `templateMode`. It posts an
 *    AssessmentInput, which `settingsToBody` writes onto the body, touching only the
 *    fields that actually changed.
 *  - Questions, bands, gate and exit pages have template-only editors, because the live
 *    ones save one database row at a time and a template has no rows.
 *
 * SAVING. Settings save on leaving a field, which is the form's own autosave. The
 * document editors save shortly after the last change, and the status line says which
 * state it is in. Nothing is left to a Save button somebody might not press - but the
 * button is there anyway, because a save you can ask for is worth having.
 */

const SAVE_DELAY_MS = 900;

type SaveState =
  | { kind: "clean" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function TemplateBuilder({
  id,
  initialDoc,
  builtin,
  seedLocked,
  canEdit,
}: {
  id: string;
  initialDoc: TemplateDoc;
  builtin: boolean;
  seedLocked: boolean;
  canEdit: boolean;
}) {
  return (
    // Its own step state, nested inside the console's. The admin sidebar's rail belongs
    // to the assessment builder and must not follow this page around.
    <BuilderTabProvider initial={TEMPLATE_STEP_KEYS[0] ?? "basics"}>
      <Inner id={id} initialDoc={initialDoc} builtin={builtin} seedLocked={seedLocked} canEdit={canEdit} />
    </BuilderTabProvider>
  );
}

function Inner({
  id,
  initialDoc,
  builtin,
  seedLocked,
  canEdit,
}: {
  id: string;
  initialDoc: TemplateDoc;
  builtin: boolean;
  seedLocked: boolean;
  canEdit: boolean;
}) {
  const tab = useBuilderTab();
  const active = tab?.active ?? TEMPLATE_STEP_KEYS[0] ?? "basics";

  const [doc, setDoc] = useState<TemplateDoc>(initialDoc);
  const [state, setState] = useState<SaveState>({ kind: "clean" });
  const [locked, setLocked] = useState(seedLocked);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // The latest document, for callbacks that must not close over a stale copy: the
  // settings form saves on blur and the debounce fires later, and both have to write
  // onto what is on screen now.
  const docRef = useRef(doc);
  docRef.current = doc;
  const savedRef = useRef(JSON.stringify(initialDoc));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (next: TemplateDoc): Promise<{ ok: true } | { ok: false; error: string }> => {
      const json = JSON.stringify(next, null, 2);
      setState({ kind: "saving" });
      const res = await updateTemplateDocument(id, json);
      if (!res.ok) {
        setState({ kind: "error", message: res.error });
        return { ok: false, error: res.error };
      }
      savedRef.current = JSON.stringify(next);
      if (res.data?.seedLocked) setLocked(true);
      setState({ kind: "saved" });
      return { ok: true };
    },
    [id],
  );

  /** Take a change to the document and schedule a save. */
  const change = useCallback(
    (next: TemplateDoc) => {
      setDoc(next);
      docRef.current = next;
      setState({ kind: "dirty" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void save(docRef.current);
      }, SAVE_DELAY_MS);
    },
    [save],
  );

  const setBody = useCallback(
    (body: AssessmentBodyExport) => change({ ...docRef.current, body }),
    [change],
  );

  /**
   * The settings form's save target.
   *
   * Writes the posted values onto the CURRENT body and saves straight away rather than
   * through the debounce: this is the form's own explicit save or its on-blur autosave,
   * and it reports the result back to the form so an error lands next to the field.
   */
  const saveSettings = useCallback(
    async (payload: AssessmentInput) => {
      const current = docRef.current;
      const next = { ...current, body: settingsToBody(current.body, payload) };
      setDoc(next);
      docRef.current = next;
      if (timer.current) clearTimeout(timer.current);
      return save(next);
    },
    [save],
  );

  // Warn before leaving with a change that has not landed yet. The debounce is under a
  // second, so this almost never fires - and "almost never" is exactly when a lost edit
  // is most expensive, because nobody is expecting it.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(docRef.current) === savedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const settings = settingsFromBody(doc.body);
  const disabled = !canEdit;

  return (
    <div className="flex flex-col gap-4">
      <StatusLine
        state={state}
        canEdit={canEdit}
        builtin={builtin}
        locked={locked}
        onSaveNow={() => {
          if (timer.current) clearTimeout(timer.current);
          void save(docRef.current);
        }}
      />

      {/* Template details: the row's own identity, not the funnel's. Collapsed, because
          it is read far more often than it is changed. */}
      <Card>
        <CardHeader className="pb-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left"
            onClick={() => setDetailsOpen((v) => !v)}
          >
            <span className="min-w-0">
              <CardTitle className="truncate text-base">{doc.title || "Untitled template"}</CardTitle>
              <CardDescription>
                {doc.category} · {SHAPE_LABELS[doc.shape]} · the shelf entry, not the funnel
              </CardDescription>
            </span>
            <span className="text-sm text-[var(--muted-foreground)]">{detailsOpen ? "Hide" : "Edit"}</span>
          </button>
        </CardHeader>
        {detailsOpen ? (
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Template name" hint="What a workspace sees on the shelf.">
                <Input
                  value={doc.title}
                  disabled={disabled}
                  onChange={(e) => change({ ...docRef.current, title: e.target.value })}
                />
              </Field>
              <Field label="Audience">
                <select
                  className={SELECT_CLASS}
                  value={doc.category}
                  disabled={disabled}
                  onChange={(e) => change({ ...docRef.current, category: e.target.value })}
                >
                  {(TEMPLATE_CATEGORIES as readonly string[]).includes(doc.category) ? null : (
                    <option value={doc.category}>{doc.category}</option>
                  )}
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Summary" hint="One line under the name on the shelf.">
              <Textarea
                rows={2}
                value={doc.summary ?? ""}
                disabled={disabled}
                onChange={(e) => change({ ...docRef.current, summary: e.target.value })}
              />
            </Field>
            <Field label="Shape" hint={SHAPE_HINTS[doc.shape]}>
              <select
                className={SELECT_CLASS}
                value={doc.shape}
                disabled={disabled}
                onChange={(e) => change({ ...docRef.current, shape: e.target.value as TemplateDoc["shape"] })}
              >
                {TEMPLATE_SHAPES.map((s) => (
                  <option key={s} value={s}>
                    {SHAPE_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Suggested AI result instructions"
              hint="Travels with the template. Blank = this template ships without an AI statement, which is a choice rather than an omission."
            >
              <Textarea
                rows={6}
                value={doc.aiInstructions ?? ""}
                disabled={disabled}
                onChange={(e) => change({ ...docRef.current, aiInstructions: e.target.value })}
              />
            </Field>
            <p className="text-xs text-[var(--muted-foreground)]">
              The template&rsquo;s own link name cannot be changed here. Renaming a built-in would leave its
              file in the code pointing at nothing, and the next seed would make a second copy of it.
            </p>
          </CardContent>
        ) : null}
      </Card>

      <BuilderStepRail tabs={TEMPLATE_BUILDER_TABS} label="Template builder steps" />

      {/* The settings steps. One component, the real one, in template mode. */}
      <AssessmentForm
        mode="edit"
        templateMode
        onSave={saveSettings}
        initial={settings}
        promptVersions={[]}
        assessmentOptions={[]}
        audienceLists={[]}
        adAccounts={[]}
        canPlatformSignup={false}
        qualificationLive={isGateLive(doc.body)}
      />

      <BuilderStep step="gate">
        <Card>
          <CardHeader>
            <CardTitle>Qualification gate</CardTitle>
            <CardDescription>
              Screen people out before the assessment. Optional - a template with no gate scores everyone.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TemplateGateEditor body={doc.body} onChange={setBody} section="gate" disabled={disabled} />
            <BuilderStepNav step="gate" steps={TEMPLATE_STEP_KEYS} note={SAVE_NOTE} />
          </CardContent>
        </Card>
      </BuilderStep>

      <BuilderStep step="exit">
        <Card>
          <CardHeader>
            <CardTitle>Exit page (disqualified)</CardTitle>
            <CardDescription>
              What someone the gate turns away actually sees. They never become a lead.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TemplateGateEditor body={doc.body} onChange={setBody} section="exit" disabled={disabled} />
            <BuilderStepNav step="exit" steps={TEMPLATE_STEP_KEYS} note={SAVE_NOTE} />
          </CardContent>
        </Card>
      </BuilderStep>

      <BuilderStep step="categories">
        <Card>
          <CardHeader>
            <CardTitle>Questions and categories</CardTitle>
            <CardDescription>
              The questions themselves, grouped into the categories that get scored.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TemplateQuestionsEditor body={doc.body} onChange={setBody} disabled={disabled} />
            <BuilderStepNav step="categories" steps={TEMPLATE_STEP_KEYS} note={SAVE_NOTE} />
          </CardContent>
        </Card>
      </BuilderStep>

      {/* Bands sit UNDER the settings card on the scoring step, the way they do in the
          live builder: the AI switch above them is part of the same decision. */}
      {active === "scoring" ? (
        <Card>
          <CardHeader>
            <CardTitle>What the scores mean</CardTitle>
            <CardDescription>Overall bands, and a band per category.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TemplateBandsEditor body={doc.body} onChange={setBody} disabled={disabled} />
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
        <Link href="/admin/templates" className="underline">
          Back to the template library
        </Link>
        <Link href={`/admin/templates?json=${id}`} className="underline">
          Edit as JSON instead
        </Link>
      </div>
    </div>
  );
}

const SAVE_NOTE = "Changes on this step save a moment after you make them.";

/** Is the gate live on this document? The lead-form preview needs to know, and it
 *  cannot work it out from the settings alone. */
function isGateLive(body: AssessmentBodyExport): boolean {
  const q = body.qualification as { enabled?: unknown; questions?: unknown } | null | undefined;
  return !!q && q.enabled === true && Array.isArray(q.questions) && q.questions.length > 0;
}

function StatusLine({
  state,
  canEdit,
  builtin,
  locked,
  onSaveNow,
}: {
  state: SaveState;
  canEdit: boolean;
  builtin: boolean;
  locked: boolean;
  onSaveNow: () => void;
}) {
  const text =
    state.kind === "saving"
      ? "Saving..."
      : state.kind === "saved"
        ? "🟢 Saved"
        : state.kind === "dirty"
          ? "Not saved yet"
          : state.kind === "error"
            ? `🟡 Not saved: ${state.message}`
            : "No changes";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
        <span className={state.kind === "error" ? "font-medium" : ""}>{text}</span>
        {canEdit ? (
          <Button type="button" size="sm" variant="outline" onClick={onSaveNow}>
            Save now
          </Button>
        ) : (
          <span className="text-xs text-[var(--muted-foreground)]">
            You can read this template. Only the owner can change one.
          </span>
        )}
      </div>
      {builtin ? (
        <p className="rounded-lg border border-green-600/40 bg-green-600/5 p-3 text-xs">
          {locked
            ? "This is a built-in, and it has been edited here, so deploys no longer overwrite it. Revert on the library screen puts back the version that ships in the code."
            : "This is a built-in, shipped in the code. The first change you save here detaches it, so a later deploy cannot put the old version back over your edit."}
        </p>
      ) : null}
    </div>
  );
}
