/**
 * The tool cap. Claude is shown at most 34 tools in all (the owner's limit is under 35), so
 * the other apps share whatever Assess360 leaves, in turns: each app gets one tool, then the
 * next, round and round, in the order each app lists its own tools. One app with fifty tools
 * can never crowd out the others.
 */

export const MAX_TOOLS_SHOWN = 34;

export function allocate<T>(groups: readonly (readonly T[])[], budget: number): T[][] {
  const out: T[][] = groups.map(() => []);
  let left = Math.max(0, budget);
  let round = 0;
  while (left > 0) {
    let took = false;
    for (let g = 0; g < groups.length && left > 0; g++) {
      const item = groups[g]![round];
      if (item !== undefined) {
        out[g]!.push(item);
        left--;
        took = true;
      }
    }
    if (!took) break;
    round++;
  }
  return out;
}
