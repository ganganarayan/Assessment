-- ROUND ROBIN: one booking link, several people, a slot open while anybody is free.
--
-- Additive and inert on arrival. assignmentMode defaults to SINGLE, so every existing
-- link keeps selling exactly one person's time and nothing about the slot maths, the
-- locks or the reporting changes for any booking that exists today.
--
-- The hours stay on the LINK and the busyness stays per PERSON. A team page publishes
-- one set of hours ("we take calls Tuesdays 10 to 6") and within them a slot survives
-- until every member is taken - which is the capacity a team page exists to sell.
-- Per-member weekly hours would mean availability rules keyed per user, a much larger
-- model, and one most teams would not use.
--
-- lastAssignedAt is the rotation cursor, and it is a TIMESTAMP rather than a counter on
-- purpose. A counter modulo the team size breaks the first time somebody is busy and
-- gets skipped: the booking still advances it, so the skipped person waits another full
-- lap. Oldest-stamp-first self-corrects, because being skipped leaves you at the front
-- of the queue. NULL sorts first, so a new member starts at the front rather than
-- waiting out everybody else's history.
-- CreateEnum
CREATE TYPE "BookingAssignment" AS ENUM ('SINGLE', 'ROUND_ROBIN');

-- AlterTable
ALTER TABLE "booking_type" ADD COLUMN     "assignmentMode" "BookingAssignment" NOT NULL DEFAULT 'SINGLE';

-- CreateTable
CREATE TABLE "booking_type_member" (
    "id" TEXT NOT NULL,
    "bookingTypeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastAssignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_type_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_type_member_bookingTypeId_idx" ON "booking_type_member"("bookingTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_type_member_bookingTypeId_userId_key" ON "booking_type_member"("bookingTypeId", "userId");

-- AddForeignKey
ALTER TABLE "booking_type_member" ADD CONSTRAINT "booking_type_member_bookingTypeId_fkey" FOREIGN KEY ("bookingTypeId") REFERENCES "booking_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_type_member" ADD CONSTRAINT "booking_type_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

