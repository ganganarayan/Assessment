-- CLINIC_AUDIT: per-question unit for scored numbers (PER_10 / PER_100 / RUPEES /
-- COUNT / POINTS). Null = the role's default, so existing configs are unchanged.
ALTER TABLE "question" ADD COLUMN "scoringUnit" TEXT;
