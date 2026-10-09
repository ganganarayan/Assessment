-- The done-for-you scarcity counter: two real numbers an operator edits by hand.
--
-- Not a timer, and not derived from a row count. The claim "7 of 20 free builds
-- remaining" is only worth making while somebody is actually decrementing it, and a
-- counter that refills overnight is the sort of thing a buyer notices exactly once.
--
-- "dfyBuildsRemaining" is nullable and starts NULL, which means the counter is shown
-- nowhere. That is the right default: an unset number should claim nothing, rather
-- than appear on a public page and quietly go stale.
ALTER TABLE "app_setting" ADD COLUMN "dfyBuildsTotal" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "app_setting" ADD COLUMN "dfyBuildsRemaining" INTEGER;
