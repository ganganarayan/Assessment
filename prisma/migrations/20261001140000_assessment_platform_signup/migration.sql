-- Platform signup funnel.
--
-- When true, finishing this assessment sends the person to /sign-up prefilled with the
-- email they just gave, instead of a result page. It is how a qualification funnel
-- becomes the signup funnel for the SaaS itself.
--
-- Default false: every existing assessment keeps its current behaviour exactly.
ALTER TABLE "assessment" ADD COLUMN "platformSignup" BOOLEAN NOT NULL DEFAULT false;
