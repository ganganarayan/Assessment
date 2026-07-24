-- Railway custom-domain provisioning fields. Additive + nullable, so it applies
-- cleanly on prod via `prisma migrate deploy` with zero downtime.
ALTER TABLE "domain" ADD COLUMN "railwayDomainId" TEXT;
ALTER TABLE "domain" ADD COLUMN "dnsTarget" TEXT;
ALTER TABLE "domain" ADD COLUMN "certStatus" TEXT;
