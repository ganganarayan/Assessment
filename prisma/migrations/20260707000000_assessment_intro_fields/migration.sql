-- Editable opt-in copy: custom profession options, intro notice override, and
-- start-button label. All additive; defaults keep the current funnel identical.
ALTER TABLE "assessment" ADD COLUMN "professionOptions" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "assessment" ADD COLUMN "introNotice" TEXT;
ALTER TABLE "assessment" ADD COLUMN "startButtonLabel" TEXT;
