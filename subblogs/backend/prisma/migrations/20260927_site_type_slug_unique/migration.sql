-- Scope BlogPost slug uniqueness to (site, type) so the same slug can exist
-- across content types on one blog (e.g. /music/hey + /article/hey), while
-- staying unique within a single blog+type. Idempotent like the other
-- migrations in this folder.
DROP INDEX IF EXISTS "BlogPost_siteId_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_siteId_type_slug_key" ON "BlogPost"("siteId", "type", "slug");
