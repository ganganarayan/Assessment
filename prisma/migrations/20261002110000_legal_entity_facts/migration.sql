-- Two entity facts that public structured data needs and the policy pages can also use.
-- They live in app_setting beside the other legal details rather than in a new table or
-- in env, so the owner edits the company's identity in exactly one screen.
--
-- Both are TEXT and nullable on purpose. "legalFoundedOn" holds an ISO year-month
-- ("2024-02"): schema.org foundingDate accepts a partial date, and a DATE column would
-- have forced a day nobody knows. Nullable because unset must mean "omit this from the
-- structured data" — never "publish a placeholder".
ALTER TABLE "app_setting" ADD COLUMN "legalGstin" TEXT;
ALTER TABLE "app_setting" ADD COLUMN "legalFoundedOn" TEXT;
