-- Email providers: which service carries the mail, and its API key.
--
-- Railway blocks outbound SMTP, so the smtp* columns only ever worked for one provider:
-- ZeptoMail, which the sender special-cased by sniffing the host and quietly switching
-- to its HTTPS API. That special case becomes a registry entry, and the choice becomes
-- a stored column instead of a guess about a hostname.

ALTER TABLE "app_setting" ADD COLUMN "emailProvider" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "emailApiKeyEnc" TEXT;

-- The backfill is what keeps every existing sender working through the deploy.
--
-- A row that was sending through ZeptoMail was doing it on the SMTP password column,
-- because that is where the Send Mail token was told to go. Move it to the API key
-- column and name the region from the host, which is the only place that information
-- exists. The smtp* columns are left untouched on purpose: if any of this is wrong, the
-- old values are still there to read.
UPDATE "app_setting"
   SET "emailProvider"  = 'ZEPTOMAIL_IN',
       "emailApiKeyEnc" = "smtpPassEnc"
 WHERE "smtpHost" ILIKE '%zeptomail.in';

UPDATE "app_setting"
   SET "emailProvider"  = 'ZEPTOMAIL_COM',
       "emailApiKeyEnc" = "smtpPassEnc"
 WHERE "smtpHost" ILIKE '%zeptomail.com';

-- Everything else that was configured at all keeps the transport it had. A row with no
-- host was never sending, so it is left null and picks up whatever the owner chooses.
UPDATE "app_setting"
   SET "emailProvider" = 'SMTP'
 WHERE "emailProvider" IS NULL
   AND "smtpHost" IS NOT NULL;
