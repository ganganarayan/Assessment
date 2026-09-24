-- Qualification gate (Page 1) + disqualified page. Both are JSON config on the
-- assessment; null = no gate (unchanged behaviour for every existing assessment).
ALTER TABLE "assessment" ADD COLUMN "qualification" JSONB;
ALTER TABLE "assessment" ADD COLUMN "disqualifiedContent" JSONB;
