-- A workspace on the platform's key may pick its own model on /w/ai, read only while
-- the liveAiModels release switch allows it. Nullable: empty means the plan's model.
ALTER TABLE "app_setting" ADD COLUMN "aiWorkspaceModel" TEXT;
