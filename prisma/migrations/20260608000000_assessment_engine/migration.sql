-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_SELECT');
CREATE TYPE "BandLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "SubmissionStatus" AS ENUM ('STARTED', 'COMPLETED');

-- CreateTable
CREATE TABLE "assessment" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "estimatedMinutes" INTEGER,
    "thankYouMessage" TEXT,
    "collectFirstName" BOOLEAN NOT NULL DEFAULT true,
    "firstNameRequired" BOOLEAN NOT NULL DEFAULT false,
    "collectLastName" BOOLEAN NOT NULL DEFAULT true,
    "lastNameRequired" BOOLEAN NOT NULL DEFAULT false,
    "collectEmail" BOOLEAN NOT NULL DEFAULT true,
    "emailRequired" BOOLEAN NOT NULL DEFAULT true,
    "collectMobile" BOOLEAN NOT NULL DEFAULT true,
    "mobileRequired" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assessmentId" TEXT NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'SINGLE_SELECT',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "questionId" TEXT NOT NULL,

    CONSTRAINT "option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_band" (
    "id" TEXT NOT NULL,
    "level" "BandLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "minScore" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assessmentId" TEXT NOT NULL,

    CONSTRAINT "result_band_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission" (
    "id" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'STARTED',
    "leadFirstName" TEXT,
    "leadLastName" TEXT,
    "leadEmail" TEXT,
    "leadMobile" TEXT,
    "totalScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "tenantId" TEXT,
    "resultBandId" TEXT,

    CONSTRAINT "submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_answer" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "submission_answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_category_score" (
    "id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "submission_category_score_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_slug_key" ON "assessment"("slug");
CREATE INDEX "assessment_tenantId_idx" ON "assessment"("tenantId");
CREATE INDEX "assessment_status_idx" ON "assessment"("status");

-- CreateIndex
CREATE INDEX "category_assessmentId_idx" ON "category"("assessmentId");

-- CreateIndex
CREATE INDEX "question_categoryId_idx" ON "question"("categoryId");

-- CreateIndex
CREATE INDEX "option_questionId_idx" ON "option"("questionId");

-- CreateIndex
CREATE INDEX "result_band_assessmentId_idx" ON "result_band"("assessmentId");

-- CreateIndex
CREATE INDEX "submission_assessmentId_idx" ON "submission"("assessmentId");
CREATE INDEX "submission_leadEmail_idx" ON "submission"("leadEmail");
CREATE INDEX "submission_createdAt_idx" ON "submission"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "submission_answer_submissionId_questionId_key" ON "submission_answer"("submissionId", "questionId");
CREATE INDEX "submission_answer_submissionId_idx" ON "submission_answer"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "submission_category_score_submissionId_categoryId_key" ON "submission_category_score"("submissionId", "categoryId");
CREATE INDEX "submission_category_score_submissionId_idx" ON "submission_category_score"("submissionId");

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option" ADD CONSTRAINT "option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_band" ADD CONSTRAINT "result_band_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submission" ADD CONSTRAINT "submission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "submission" ADD CONSTRAINT "submission_resultBandId_fkey" FOREIGN KEY ("resultBandId") REFERENCES "result_band"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_answer" ADD CONSTRAINT "submission_answer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submission_answer" ADD CONSTRAINT "submission_answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submission_answer" ADD CONSTRAINT "submission_answer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_category_score" ADD CONSTRAINT "submission_category_score_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submission_category_score" ADD CONSTRAINT "submission_category_score_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
