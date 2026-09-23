-- WhatsApp Business Account (WABA) id, needed to list approved message templates
-- via the Meta Graph API. Optional; sending still only needs the phone number id.
ALTER TABLE "app_setting" ADD COLUMN "wabaBusinessAccountId" TEXT;
