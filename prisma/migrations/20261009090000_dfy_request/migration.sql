-- Done-for-you scorecard applications.
--
-- The home page's primary call to action now points at /build, so a lost row here is a
-- lost conversion for the page the whole rewrite was for. The write path stores the row
-- BEFORE it tries to notify anybody, and "notifiedAt" records whether the alert actually
-- went out - a dead SMTP host then costs an alert, not an applicant.
--
-- No tenant column: an applicant is not a tenant, and the point of the offer is to hand
-- someone a finished funnel before asking them to sign up for anything.
CREATE TABLE "dfy_request" (
    "id" TEXT NOT NULL,
    "business" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "website" TEXT,
    "sells" TEXT NOT NULL,
    "pricePoint" TEXT NOT NULL,
    "trafficSource" TEXT NOT NULL,
    "monthlyLeads" TEXT NOT NULL,
    "badLead" TEXT NOT NULL,
    "calendarLink" TEXT,
    "adAccountAccess" BOOLEAN NOT NULL DEFAULT false,
    -- NEW | CONTACTED | BUILT | DECLINED. Text, not an enum: this pipeline will be
    -- renamed while the offer is being run, and renaming a Postgres enum value is a
    -- migration where renaming a string is nothing at all.
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dfy_request_pkey" PRIMARY KEY ("id")
);

-- The console reads "the new ones, newest first", which is this index exactly.
CREATE INDEX "dfy_request_status_createdAt_idx" ON "dfy_request"("status", "createdAt");
