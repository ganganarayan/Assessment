-- The approved Meta template name fired when somebody submits the /build intake.
--
-- Nullable and starting NULL on purpose: a WhatsApp template must be submitted and
-- approved inside Meta Business Manager before it can be sent, which is an account
-- action nobody can perform from this app. The send therefore stays dormant until a
-- real approved name is pasted into Settings, rather than failing on every submission
-- and filling the logs with rejections nobody can fix from here.
ALTER TABLE "app_setting" ADD COLUMN "dfyWabaTemplate" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "dfyWabaLang" TEXT;
