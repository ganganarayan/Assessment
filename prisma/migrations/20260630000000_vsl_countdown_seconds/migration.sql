-- Anticipation countdown (seconds) shown after Submit before the destination/VSL
-- loads. 0 = redirect immediately. Default 10 (matches the prior hardcoded value).
ALTER TABLE "assessment" ADD COLUMN "vslCountdownSeconds" INTEGER NOT NULL DEFAULT 10;
