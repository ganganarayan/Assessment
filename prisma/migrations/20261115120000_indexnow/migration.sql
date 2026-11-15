-- Additive only: two new tables for IndexNow submissions.
CREATE TABLE "IndexNowUrl" (
    "url" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "lastmod" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IndexNowUrl_pkey" PRIMARY KEY ("url")
);
CREATE INDEX "IndexNowUrl_host_idx" ON "IndexNowUrl"("host");

CREATE TABLE "IndexNowRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "host" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "status" INTEGER NOT NULL,
    "note" TEXT,
    CONSTRAINT "IndexNowRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IndexNowRun_createdAt_idx" ON "IndexNowRun"("createdAt");
