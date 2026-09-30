-- Internal (unlimited) tenants, and the assessment served at a tenant root.
--
-- `unlimited` marks a tenant the platform owner runs themselves: unlimited limits and
-- every feature on, like the platform. Without it an internal tenant has to sit on a
-- paid plan it is never billed for, and one that is missed silently loses Meta CAPI
-- and locks at 25 responses a month while its ads keep spending.
--
-- `primaryAssessmentId` is which assessment a custom domain or subdomain root serves.

ALTER TABLE "tenant" ADD COLUMN "unlimited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenant" ADD COLUMN "primaryAssessmentId" TEXT;
