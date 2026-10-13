/** Entry point for `npm run qa:seed`. */
import { closeDb } from "../db.js";
import { seedFixtures } from "./seed.js";

seedFixtures(process.argv.includes("--rm"))
  .catch((err: unknown) => {
    console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
