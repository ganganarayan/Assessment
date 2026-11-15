-- Owner test runs: flag page views and gate rejections, and store a Meta test event code per ad account.
ALTER TABLE "PageView" ADD COLUMN "isPreview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GateDisqualification" ADD COLUMN "isPreview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdAccount" ADD COLUMN "testEventCode" TEXT;
