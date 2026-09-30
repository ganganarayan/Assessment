-- Previous rendered report, kept for rollback.
--
-- Exactly two slots rather than a list: "keep the latest two" IS two slots, and a JSON
-- array would need pruning logic that can drift from the retention rule it enforces.
-- Superseding rotates current -> previous and deletes whatever was in previous, so at
-- most two objects exist per submission and storage cannot creep.

ALTER TABLE "submission" ADD COLUMN "reportPrevKey" TEXT;
