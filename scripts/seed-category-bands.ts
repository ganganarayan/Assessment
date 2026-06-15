/**
 * Seed per-category result bands from a JSON config (UI is a follow-up).
 *   npx tsx scripts/seed-category-bands.ts <assessment-slug> <config.json>
 *
 * config.json shape:
 * [
 *   { "name": "Sleep & Mental Recovery",
 *     "bands": [
 *       { "min": 0,  "max": 49, "label": "Needs attention", "meaning": "…" },
 *       { "min": 50, "max": 100, "label": "Strong",         "meaning": "…" }
 *     ] }
 * ]
 * Percentages are 0–100 (same basis as overall bands). Ranges must not overlap.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db/prisma";
import { rangeOverlaps } from "../src/features/assessment/bands";

interface BandCfg {
  min: number;
  max: number;
  label: string;
  meaning?: string;
}
interface CategoryCfg {
  name: string;
  bands: BandCfg[];
}

async function main() {
  const slug = process.argv[2];
  const file = process.argv[3];
  if (!slug || !file) {
    console.error("usage: tsx scripts/seed-category-bands.ts <assessment-slug> <config.json>");
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(file, "utf8")) as CategoryCfg[];
  const assessment = await prisma.assessment.findUnique({
    where: { slug },
    select: { id: true, categories: { select: { id: true, name: true } } },
  });
  if (!assessment) {
    console.error(`Assessment "${slug}" not found.`);
    process.exit(1);
  }
  const idByName = new Map(assessment.categories.map((c) => [c.name, c.id]));

  for (const entry of config) {
    const categoryId = idByName.get(entry.name);
    if (!categoryId) {
      console.warn(`  skip: category "${entry.name}" not on this assessment`);
      continue;
    }
    // Non-overlap validation (same rule as overall bands).
    for (let i = 0; i < entry.bands.length; i++) {
      const b = entry.bands[i]!;
      const others = entry.bands
        .filter((_, j) => j !== i)
        .map((x) => ({ minScore: x.min, maxScore: x.max }));
      if (rangeOverlaps({ minScore: b.min, maxScore: b.max }, others)) {
        console.error(`  overlap in "${entry.name}" near [${b.min}, ${b.max}]`);
        process.exit(1);
      }
    }
    await prisma.$transaction([
      prisma.categoryResultBand.deleteMany({ where: { categoryId } }),
      prisma.categoryResultBand.createMany({
        data: entry.bands
          .slice()
          .sort((a, b) => a.min - b.min)
          .map((b, i) => ({
            categoryId,
            label: b.label,
            meaning: b.meaning ?? null,
            minScore: b.min,
            maxScore: b.max,
            displayOrder: i,
          })),
      }),
    ]);
    console.log(`  set ${entry.bands.length} bands for "${entry.name}"`);
  }
  console.log("done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
