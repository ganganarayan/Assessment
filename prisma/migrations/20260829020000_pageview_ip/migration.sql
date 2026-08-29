-- Store the client IP on page views (x-forwarded-for first hop), for the admin
-- page-view log + bot triage. Additive; existing rows stay null.
ALTER TABLE "page_view" ADD COLUMN "ip" TEXT;
