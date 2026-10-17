-- Migration 0575 — one provider payment activates at most one job boost.
--
-- Job boosts are now created ONLY through the paid checkout
-- (POST /api/checkout {kind:"job_boost"}): start inserts the row in
-- 'pending_payment' and the job is sponsored only after confirm verifies
-- the provider transaction and atomically claims its id into
-- job_boosts.stripe_payment_intent_id. This partial UNIQUE index (non-null
-- ids only) closes the race between two concurrent confirms.
--
-- Safe to auto-run any number of times: returns early when the index
-- exists; skips with a NOTICE (never deletes or rewrites a row) if
-- duplicate ids already exist. Declared in db/schema/advertising.ts under
-- the same name (CI drizzle-kit push drops undeclared indexes).

DO $$
DECLARE
  dup_ids integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_job_boosts_stripe_payment_intent_id'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO dup_ids FROM (
    SELECT stripe_payment_intent_id
    FROM job_boosts
    WHERE stripe_payment_intent_id IS NOT NULL
    GROUP BY stripe_payment_intent_id
    HAVING count(*) > 1
  ) AS dups;

  IF dup_ids > 0 THEN
    RAISE NOTICE '0575: % stripe_payment_intent_id value(s) appear on more than one job_boosts row — uq_job_boosts_stripe_payment_intent_id NOT created; resolve the duplicates (owner decision)', dup_ids;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_job_boosts_stripe_payment_intent_id
    ON job_boosts (stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL;
END $$;
