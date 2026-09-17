-- Free-text audience field + per-tenant canonical audience list.
-- The audience MODE (dropdown vs free text) and freeTextRequired live inside the
-- existing Assessment.audienceGate JSON, so no Assessment column change is needed.
-- This only adds the tenant's canonical list, which feeds the free-field
-- suggestions and the normalize screen. Nullable => every existing row = no list.
ALTER TABLE "app_setting" ADD COLUMN "audienceCanonical" JSONB;
