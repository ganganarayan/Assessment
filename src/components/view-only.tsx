/**
 * View-only access for VIEW staff (Phase 5). The server already refuses their saves;
 * this stops the screen offering them: every button and field inside is disabled by the
 * fieldset, and one line says why. Links still work, so they can read and navigate.
 *
 * Wrap EDITORS, not list screens with search or filters: those would be disabled too.
 * `bare` drops the note, for a page that shows it once above several wrapped forms.
 */
export function ViewOnly({ readOnly, bare = false, children }: { readOnly: boolean; bare?: boolean; children: React.ReactNode }) {
  if (!readOnly) return <>{children}</>;
  return (
    <>
      {bare ? null : <ViewOnlyNote />}
      <fieldset disabled className="contents">
        {children}
      </fieldset>
    </>
  );
}

export function ViewOnlyNote() {
  return (
    <p className="rounded-md border border-dashed px-3 py-2 text-xs text-[var(--muted-foreground)]">
      You have view-only access here. Ask a workspace admin for edit rights to make changes.
    </p>
  );
}
