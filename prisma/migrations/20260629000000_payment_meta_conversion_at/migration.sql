-- Stamp when the Meta Purchase conversion (CAPI) was confirmed sent for a payment.
-- Null = never fired. Authoritative per-sale answer to "did Meta receive this".
ALTER TABLE "payment" ADD COLUMN "metaConversionAt" TIMESTAMP(3);
