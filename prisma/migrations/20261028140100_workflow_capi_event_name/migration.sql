-- The Meta event name a CAPI_EVENT step fires.
--
-- A plain string, not an enum: Meta takes any name it is given, the funnel already fires
-- custom ones, and each workspace configures its own. An enum would mean a migration
-- every time somebody invents an event, which is what drives people back to typing names
-- by hand and misspelling them.

ALTER TABLE "workflow_step" ADD COLUMN "capiEventName" TEXT;
