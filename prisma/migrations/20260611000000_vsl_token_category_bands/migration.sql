-- VSL/destination token flow + per-category bands. All additive.

-- Assessment: destination page + token TTL.
ALTER TABLE "assessment" ADD COLUMN "targetUrl" TEXT;
ALTER TABLE "assessment" ADD COLUMN "targetOrigin" TEXT;
ALTER TABLE "assessment" ADD COLUMN "tokenTtlSeconds" INTEGER;

-- Submission: opaque public ids + denormalized read snapshot.
ALTER TABLE "submission" ADD COLUMN "customerId" TEXT;
ALTER TABLE "submission" ADD COLUMN "resultToken" TEXT;
ALTER TABLE "submission" ADD COLUMN "resultTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "submission" ADD COLUMN "resultSnapshot" JSONB;

CREATE UNIQUE INDEX "submission_customerId_key" ON "submission"("customerId");
CREATE UNIQUE INDEX "submission_resultToken_key" ON "submission"("resultToken");

-- Per-category bands (mirrors result_band, scoped to a category).
CREATE TABLE "category_result_band" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "meaning" TEXT,
    "minScore" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "category_result_band_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "category_result_band_categoryId_idx" ON "category_result_band"("categoryId");

ALTER TABLE "category_result_band"
  ADD CONSTRAINT "category_result_band_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
