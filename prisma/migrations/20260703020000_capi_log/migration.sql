-- Purchase CAPI config on the singleton settings.
ALTER TABLE "app_setting"
  ADD COLUMN "purchaseAutoFireAmounts"     TEXT    NOT NULL DEFAULT '199,499,999,1000',
  ADD COLUMN "purchaseHighTicketThreshold" INTEGER NOT NULL DEFAULT 4000,
  ADD COLUMN "purchaseHighTicketEventName" TEXT    NOT NULL DEFAULT 'Purchase';

-- Audit log: one row per captured payment = the Purchase CAPI event + Meta response.
CREATE TABLE "capi_log" (
  "id"                TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "email"             TEXT,
  "phone"             TEXT,
  "name"              TEXT,
  "amountPaise"       INTEGER,
  "currency"          TEXT NOT NULL DEFAULT 'INR',
  "eventName"         TEXT NOT NULL,
  "matched"           BOOLEAN NOT NULL DEFAULT false,
  "autoFired"         BOOLEAN NOT NULL DEFAULT false,
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "httpStatus"        INTEGER,
  "response"          TEXT,
  "submissionId"      TEXT,
  "firedAt"           TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "capi_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "capi_log_providerPaymentId_key" ON "capi_log"("providerPaymentId");
CREATE INDEX "capi_log_status_idx" ON "capi_log"("status");
CREATE INDEX "capi_log_createdAt_idx" ON "capi_log"("createdAt");
