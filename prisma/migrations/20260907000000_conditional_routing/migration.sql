-- Conditional routing (Phase 1). Additive: a new enum + a QuestionRoute table
-- keyed one-per-option. No existing row changes, so assessments with no routes
-- behave exactly as before. Targets (targetQuestionId/targetCategoryId) are plain
-- scalar refs with no FK, so deleting a target never cascades here; the routing
-- engine treats a missing target as a linear NEXT.

-- CreateEnum
CREATE TYPE "RouteAction" AS ENUM ('NEXT', 'JUMP_TO_QUESTION', 'JUMP_TO_CATEGORY', 'SKIP_TO_END');

-- CreateTable
CREATE TABLE "question_route" (
    "id" TEXT NOT NULL,
    "action" "RouteAction" NOT NULL DEFAULT 'NEXT',
    "targetQuestionId" TEXT,
    "targetCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "question_route_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_route_optionId_key" ON "question_route"("optionId");

-- CreateIndex
CREATE INDEX "question_route_questionId_idx" ON "question_route"("questionId");

-- AddForeignKey
ALTER TABLE "question_route" ADD CONSTRAINT "question_route_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_route" ADD CONSTRAINT "question_route_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "option"("id") ON DELETE CASCADE ON UPDATE CASCADE;
