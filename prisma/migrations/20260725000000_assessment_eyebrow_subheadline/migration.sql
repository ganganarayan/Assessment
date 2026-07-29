-- Opt-in hero copy: eyebrow (kicker above the headline) + subheadline (below it).
-- Additive + nullable, so it applies cleanly on prod via `prisma migrate deploy`.
ALTER TABLE "assessment" ADD COLUMN "eyebrow" TEXT;
ALTER TABLE "assessment" ADD COLUMN "subheadline" TEXT;
