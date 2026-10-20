-- ZOOM: a per-person meeting link, made when the booking is made.
--
-- Additive and inert. No workspace has a Zoom connection, no rule has a meeting step,
-- and nothing about an existing booking changes.
--
-- 🔴 THE LINK IS CREATED AT BOOKING TIME, not minutes before the call, and the columns
-- are on the appointment for that reason. A link that fails to be created ten minutes
-- beforehand leaves nobody any time to fix it, for a meeting about to start; one created
-- at booking has hours or days of slack, rides in the confirmation as well as in every
-- reminder, and leaves the ten-minute message simply reading a link that already exists.
--
-- 🔴 zoom_account.refreshTokenEnc is REWRITTEN on every refresh. Zoom rotates the
-- refresh token: each renewal returns a new one and invalidates the old. Storing only
-- the first works for an hour and then fails forever, which is the commonest way these
-- integrations break.
--
-- One connection per workspace, not per staff member. The meeting is hosted from
-- whichever account was connected; creating it for another user needs an admin-level
-- scope, which would make the Marketplace review harder for a case most workspaces do
-- not have. The model gains a userId when somebody needs it.

-- AlterTable
ALTER TABLE "app_setting" ADD COLUMN     "zoomClientId" TEXT,
ADD COLUMN     "zoomClientSecretEnc" TEXT;

-- AlterTable
ALTER TABLE "appointment" ADD COLUMN     "zoomError" TEXT,
ADD COLUMN     "zoomJoinUrl" TEXT,
ADD COLUMN     "zoomMeetingId" TEXT;

-- AlterTable
ALTER TABLE "automation_action" ADD COLUMN     "zoomTopic" TEXT;

-- CreateTable
CREATE TABLE "zoom_account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "zoomUserId" TEXT,
    "zoomEmail" TEXT,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zoom_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zoom_account_tenantId_key" ON "zoom_account"("tenantId");

-- AddForeignKey
ALTER TABLE "zoom_account" ADD CONSTRAINT "zoom_account_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

