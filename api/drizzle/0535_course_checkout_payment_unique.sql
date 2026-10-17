-- Migration 0535 — one provider payment pays for at most one course checkout.
--
-- course_checkouts.provider_payment_id gets a partial UNIQUE index (non-null
-- ids only). Course confirm now verifies the payment with the provider and
-- claims the id atomically (services/billing/checkout/kinds/course.ts →
-- repositories/courseCheckoutRepository.ts claimPayment); the index closes
-- the race between two concurrent confirms.
--
-- Safe to auto-run against production, any number of times:
--   * before 2026-10-17 confirm-payment trusted a client-supplied id, so
--     production MAY already hold the same id on two checkouts. The index is
--     created only when it is missing AND no duplicate ids exist; otherwise a
--     NOTICE reports the duplicate count and the block skips. Resolving
--     duplicates is an owner decision — nothing here deletes or rewrites a row;
--   * the index is declared in db/schema/courses.ts under the same name
--     (CI drizzle-kit push drops undeclared indexes).

DO $$
DECLARE
  dup_ids integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_course_checkouts_provider_payment_id'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO dup_ids FROM (
    SELECT provider_payment_id
    FROM course_checkouts
    WHERE provider_payment_id IS NOT NULL
    GROUP BY provider_payment_id
    HAVING count(*) > 1
  ) AS dups;

  IF dup_ids > 0 THEN
    RAISE NOTICE '0535: % provider_payment_id value(s) appear on more than one course_checkouts row — uq_course_checkouts_provider_payment_id NOT created; resolve the duplicates (owner decision); db:push then creates it from the schema declaration', dup_ids;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_course_checkouts_provider_payment_id
    ON course_checkouts (provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;
END $$;
