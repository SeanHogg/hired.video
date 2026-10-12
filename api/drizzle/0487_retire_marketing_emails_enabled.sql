-- #1976 — retire the coarse `account_preferences.marketing_emails_enabled`
-- opt-out column. The authoritative marketing-consent store is the email-keyed
-- `email_marketing_preferences` ledger that the send path actually honors
-- (MarketingConsentService.filterMailable). This migration preserves every
-- existing opt-out by projecting `marketing_emails_enabled = false` rows into
-- `email_marketing_preferences.unsubscribed_all = true` BEFORE dropping the
-- column, then drops it.

-- 1) Carry forward existing opt-outs. For each user who had coarse marketing
--    email OFF and has an email, upsert an email-keyed ledger row flagged
--    unsubscribed-all. ON CONFLICT keeps any existing row but forces the
--    opt-out (a stricter state always wins). gen_random_uuid() supplies an
--    opaque token (core pg, no pgcrypto dependency); the app mints 32-byte
--    tokens for new rows but a uuid is a valid unguessable key for migrated
--    ones.
INSERT INTO "email_marketing_preferences" ("email", "user_id", "token", "unsubscribed_all", "unsubscribed_at", "source")
SELECT
  lower(u."email"),
  u."id",
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  true,
  now(),
  'migrated:0487'
FROM "account_preferences" ap
JOIN "users" u ON u."id" = ap."user_id"
WHERE ap."marketing_emails_enabled" = false
  AND u."email" IS NOT NULL
  AND u."email" <> ''
ON CONFLICT ("email") DO UPDATE
  SET "unsubscribed_all" = true,
      "unsubscribed_at" = COALESCE("email_marketing_preferences"."unsubscribed_at", now()),
      "updated_at" = now();

-- 2) Drop the retired column.
ALTER TABLE "account_preferences" DROP COLUMN IF EXISTS "marketing_emails_enabled";
