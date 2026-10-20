-- A seed cannot know which database it is running in.
--
-- The first seed marked automations, calendar and contacts as released, because they
-- were already live for customers - true of the database it was written against
-- (staging) and false of every other one. Production has never shown any of the three
-- to anybody, so applying that seed there would have released three features to every
-- customer at the moment of deploy: exactly the accident these switches exist to stop.
--
-- So the claim is withdrawn. Every feature starts held back in every database, and a
-- human releases it per environment, which is also what makes the audit columns mean
-- something.
--
-- Only rows NOBODY HAS TOUCHED are changed: a key an owner has already flipped keeps
-- whatever they chose. Matching on the seed note as well makes this idempotent - after
-- it runs, nothing matches it again, including on a database where the owner later
-- releases these features.
UPDATE "feature_release"
SET "released"   = false,
    "releasedAt" = NULL,
    "note"       = 'Held back until released per environment.'
WHERE "key" IN ('automations', 'calendar', 'contacts')
  AND "changedByUserId" IS NULL
  AND "note" = 'Already live before release switches existed.';
