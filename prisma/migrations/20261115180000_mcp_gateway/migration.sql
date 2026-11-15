-- Additive only: the MCP gateway's app list and suggestion dismissals.
CREATE TABLE "McpUpstreamApp" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "secretEnc" TEXT,
    "description" TEXT NOT NULL,
    "upgradeUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "McpUpstreamApp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "McpUpstreamApp_prefix_key" ON "McpUpstreamApp"("prefix");

CREATE TABLE "McpSuggestionDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpSuggestionDismissal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "McpSuggestionDismissal_userId_app_key" ON "McpSuggestionDismissal"("userId", "app");

-- The three starting apps, with no URL: each stays hidden until its URL and secret are set.
INSERT INTO "McpUpstreamApp" ("id", "prefix", "name", "description", "sortOrder", "updatedAt") VALUES
  ('mcpapp_router', 'router', 'AVideoRouter', 'Sends your recordings to the places they need to go.', 1, CURRENT_TIMESTAMP),
  ('mcpapp_vidapulse', 'vidapulse', 'VidaPulse', 'Shows where viewers stop watching your videos.', 2, CURRENT_TIMESTAMP),
  ('mcpapp_content', 'content', 'Content Engine', 'Turns your material into posts and ads.', 3, CURRENT_TIMESTAMP)
ON CONFLICT ("prefix") DO NOTHING;
