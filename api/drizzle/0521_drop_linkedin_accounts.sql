-- 0521_drop_linkedin_accounts.sql
--
-- LinkedIn posting moved onto the shared social publisher (2026-10-10):
-- tokens live encrypted in `social_connections` and members reconnect once.
-- The legacy `linkedin_accounts` table held PLAINTEXT access tokens that
-- nothing reads any more, so drop it rather than keep secrets at rest.
-- Its declaration was removed from api/src/db/schema/studiofeatures.ts in
-- the same change (no data is copied, so push dropping it first is fine).

DROP TABLE IF EXISTS linkedin_accounts;
