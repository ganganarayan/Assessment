-- Track link clicks on nurture/marketing emails. Set by the /e/c/[id] click
-- redirect the first time a rewritten link is clicked (EMAIL only). Opens are NOT
-- tracked (pixel opens are noisy); a click is the reliable engagement signal.
ALTER TABLE "nurture_log" ADD COLUMN "clickedAt" TIMESTAMP(3);
