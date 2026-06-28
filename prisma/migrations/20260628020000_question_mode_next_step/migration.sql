-- Question display mode + explicit next-step binding. New enums (CREATE TYPE) and
-- columns using them are safe in one migration (the ALTER-TYPE-ADD-VALUE rule only
-- applies to extending EXISTING enums). nextStep is back-filled from paidMode so
-- existing paid assessments keep taking payment.
CREATE TYPE "QuestionDisplayMode" AS ENUM ('ALL', 'CATEGORY', 'SINGLE');
CREATE TYPE "NextStep" AS ENUM ('PAYMENT', 'DESTINATION');

ALTER TABLE "assessment"
  ADD COLUMN "questionDisplayMode" "QuestionDisplayMode" NOT NULL DEFAULT 'ALL',
  ADD COLUMN "nextStep" "NextStep" NOT NULL DEFAULT 'DESTINATION';

UPDATE "assessment" SET "nextStep" = 'PAYMENT' WHERE "paidMode" = true;
