-- Persist the DNS records a domain owner must add at their provider (Railway's
-- required CNAME + any verification records), so the settings page can show them
-- without re-querying Railway on every load. Additive + nullable.
ALTER TABLE "domain" ADD COLUMN "dnsRecords" JSONB;
