-- Migration 0523 — one provider payment pays for at most one boost.
--
-- boost_checkouts.provider_payment_id gets a partial UNIQUE index (non-null
-- ids only). The confirm path already claims a payment id atomically
-- (services/advertising/boost-checkout.ts claimPayment); the index closes
-- the race between two concurrent confirms.
--
-- Safe to auto-run against production, any number of times:
--   * before the 2026-10-10 provider-verification fix, confirm-payment
--     trusted the caller, so production MAY already hold the same id on two
--     checkouts. A plain CREATE UNIQUE INDEX would then fail and break the
--     deploy. This block creates the index only when the index is missing
--     AND no duplicate ids exist; otherwise it raises a NOTICE with the
--     duplicate count and skips. Resolving duplicates is an owner decision —
--     nothing here deletes or rewrites a row;
--   * the index is declared in db/schema/gapExtensions.ts under the same
--     name (CI drizzle-kit push drops undeclared indexes).

DO $$
DECLARE
  dup_ids integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_boost_checkouts_provider_payment_id'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO dup_ids FROM (
    SELECT provider_payment_id
    FROM boost_checkouts
    WHERE provider_payment_id IS NOT NULL
    GROUP BY provider_payment_id
    HAVING count(*) > 1
  ) AS dups;

  IF dup_ids > 0 THEN
    RAISE NOTICE '0523: % provider_payment_id value(s) appear on more than one boost_checkouts row — uq_boost_checkouts_provider_payment_id NOT created; resolve the duplicates (owner decision); db:push then creates it from the schema declaration', dup_ids;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_boost_checkouts_provider_payment_id
    ON boost_checkouts (provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;
END $$;
