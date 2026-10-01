-- Cloudflare for SaaS: the custom-hostname id for a tenant domain.
--
-- Railway caps custom domains per service by plan, so one Railway slot per tenant
-- domain puts a hard ceiling on how many tenants can bring their own domain.
-- Cloudflare for SaaS issues the certificate and routes the host at its edge, so the
-- ceiling moves from "Railway plan tier" to "100 free custom hostnames, then cents".
--
-- Nullable: hosts provisioned the old way (Railway custom domain) keep working
-- untouched, and a host added before this column existed simply has no id.
ALTER TABLE "domain" ADD COLUMN "cfHostnameId" TEXT;
