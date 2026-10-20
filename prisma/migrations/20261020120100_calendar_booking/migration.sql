-- CALENDAR: 1:1 appointment booking.
--
-- Additive and empty on arrival. No workspace has a booking type, so no calendar page
-- shows anything and no funnel behaves differently until somebody creates one.
--
-- Two guards are worth reading before changing anything here:
--   appointment.slotLock  is UNIQUE and NULLABLE. It holds the booking type plus the
--                         start instant while the row is live and is set to NULL on
--                         cancel. Postgres treats NULLs as distinct, so two concurrent
--                         bookings of one slot cannot both commit, and a cancelled slot
--                         frees itself. This is the whole double-booking defence.
--   appointment.publicToken  is the capability in a respondent's own .ics and (later)
--                         reschedule link, which is why it is unique and random rather
--                         than the row id.
-- CreateEnum
CREATE TYPE "BookingLocationKind" AS ENUM ('MEET_LINK', 'PHONE', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('BOOKING', 'MANUAL');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AvailabilityExceptionKind" AS ENUM ('BLOCK', 'OPEN');

ALTER TABLE "app_setting" ADD COLUMN     "calendarFeedToken" TEXT;

-- CreateTable
CREATE TABLE "booking_type" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "bufferMin" INTEGER NOT NULL DEFAULT 0,
    "noticeMin" INTEGER NOT NULL DEFAULT 120,
    "horizonDays" INTEGER NOT NULL DEFAULT 30,
    "slotStepMin" INTEGER NOT NULL DEFAULT 0,
    "maxPerDay" INTEGER,
    "locationKind" "BookingLocationKind" NOT NULL DEFAULT 'MEET_LINK',
    "locationValue" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assessmentId" TEXT,
    "adAccountId" TEXT,
    "assignedUserId" TEXT,
    "fireMetaCapi" BOOLEAN NOT NULL DEFAULT true,
    "metaBookedEvent" TEXT NOT NULL DEFAULT 'Schedule',
    "metaCancelledEvent" TEXT NOT NULL DEFAULT 'AppointmentCancelled',
    "metaAttendedEvent" TEXT NOT NULL DEFAULT 'AppointmentAttended',
    "metaNoShowEvent" TEXT NOT NULL DEFAULT 'AppointmentNoShow',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_rule" (
    "id" TEXT NOT NULL,
    "bookingTypeId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exception" (
    "id" TEXT NOT NULL,
    "bookingTypeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "AvailabilityExceptionKind" NOT NULL DEFAULT 'BLOCK',
    "startMin" INTEGER,
    "endMin" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingTypeId" TEXT,
    "source" "AppointmentSource" NOT NULL DEFAULT 'BOOKING',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "attendeeName" TEXT,
    "attendeeEmail" TEXT,
    "attendeeMobile" TEXT,
    "submissionId" TEXT,
    "assignedUserId" TEXT,
    "fbp" TEXT,
    "fbc" TEXT,
    "externalId" TEXT,
    "clientIp" TEXT,
    "userAgent" TEXT,
    "attribution" JSONB,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "slotLock" TEXT,
    "publicToken" TEXT NOT NULL,
    "reportedBookedAt" TIMESTAMP(3),
    "reportedCancelledAt" TIMESTAMP(3),
    "reportedAttendedAt" TIMESTAMP(3),
    "reportedNoShowAt" TIMESTAMP(3),
    "rescheduledFromId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "attendanceMarkedAt" TIMESTAMP(3),
    "googleEventId" TEXT,
    "googleSyncedAt" TIMESTAMP(3),
    "googleSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "googleEmail" TEXT,
    "calendarId" TEXT,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_type_slug_key" ON "booking_type"("slug");

-- CreateIndex
CREATE INDEX "booking_type_tenantId_idx" ON "booking_type"("tenantId");

-- CreateIndex
CREATE INDEX "booking_type_assessmentId_idx" ON "booking_type"("assessmentId");

-- CreateIndex
CREATE INDEX "availability_rule_bookingTypeId_idx" ON "availability_rule"("bookingTypeId");

-- CreateIndex
CREATE INDEX "availability_exception_bookingTypeId_date_idx" ON "availability_exception"("bookingTypeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_slotLock_key" ON "appointment"("slotLock");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_publicToken_key" ON "appointment"("publicToken");

-- CreateIndex
CREATE INDEX "appointment_tenantId_startAt_idx" ON "appointment"("tenantId", "startAt");

-- CreateIndex
CREATE INDEX "appointment_bookingTypeId_startAt_idx" ON "appointment"("bookingTypeId", "startAt");

-- CreateIndex
CREATE INDEX "appointment_submissionId_idx" ON "appointment"("submissionId");

-- CreateIndex
CREATE INDEX "appointment_status_startAt_idx" ON "appointment"("status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_account_tenantId_key" ON "google_calendar_account"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "app_setting_calendarFeedToken_key" ON "app_setting"("calendarFeedToken");

-- AddForeignKey
ALTER TABLE "booking_type" ADD CONSTRAINT "booking_type_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_type" ADD CONSTRAINT "booking_type_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_type" ADD CONSTRAINT "booking_type_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "ad_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rule" ADD CONSTRAINT "availability_rule_bookingTypeId_fkey" FOREIGN KEY ("bookingTypeId") REFERENCES "booking_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exception" ADD CONSTRAINT "availability_exception_bookingTypeId_fkey" FOREIGN KEY ("bookingTypeId") REFERENCES "booking_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_bookingTypeId_fkey" FOREIGN KEY ("bookingTypeId") REFERENCES "booking_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_account" ADD CONSTRAINT "google_calendar_account_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

