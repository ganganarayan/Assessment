-- Owner test runs: flag page views and gate rejections, and store a Meta test event code per ad account.
ALTER TABLE "page_view" ADD COLUMN "isPreview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "gate_disqualification" ADD COLUMN "isPreview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ad_account" ADD COLUMN "testEventCode" TEXT;
