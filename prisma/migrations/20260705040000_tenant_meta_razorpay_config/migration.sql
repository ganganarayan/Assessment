-- Per-tenant Meta + Razorpay config storage. All null on the id='singleton' row, so
-- the platform/Gita path keeps using env (NEXT_PUBLIC_META_PIXEL_ID /
-- META_CAPI_ACCESS_TOKEN / RAZORPAY_*), unchanged. Secrets are encrypted at rest.
ALTER TABLE "app_setting" ADD COLUMN "metaPixelId"              TEXT;
ALTER TABLE "app_setting" ADD COLUMN "metaCapiTokenEnc"         TEXT;
ALTER TABLE "app_setting" ADD COLUMN "razorpayKeyId"            TEXT;
ALTER TABLE "app_setting" ADD COLUMN "razorpayKeySecretEnc"     TEXT;
ALTER TABLE "app_setting" ADD COLUMN "razorpayWebhookSecretEnc" TEXT;
