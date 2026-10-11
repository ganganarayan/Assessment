/**
 * Audience-gate fixes applied to an IMPORTED assessment, kept out of import.ts so they
 * can be exercised without a database (scripts/verify-audience-lists.ts).
 */

/**
 * An imported audience gate, with its `listId` dropped.
 *
 * Audience lists belong to a workspace, and an export can land in any workspace - a
 * template from the library, a file from another install. Carrying the id over would
 * leave the gate pointing at a list the importer cannot see, which the public resolver
 * ignores anyway (it checks ownership). Dropping it here makes the gate say what will
 * actually happen: use this workspace's default list until somebody picks another.
 */
export function importedGate<T>(gate: T): T {
  if (!gate || typeof gate !== "object" || Array.isArray(gate)) return gate;
  const { listId: _dropped, ...rest } = gate as Record<string, unknown>;
  return { ...rest, listId: "" } as T;
}
