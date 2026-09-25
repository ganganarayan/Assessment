-- Platform/app SUBSCRIPTION funnel pixel (Assess360 SaaS: landing PageView, signup
-- CompleteRegistration, subscription Purchase). Separate from the Gita assessment
-- pixel (metaPixelId/metaCapiTokenEnc). CAPI token encrypted at rest; singleton only.
ALTER TABLE "app_setting" ADD COLUMN "platformPixelId" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "platformCapiTokenEnc" TEXT;
