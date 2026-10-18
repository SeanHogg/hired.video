-- 0593_payout_ledger_source_kind_check.sql
--
-- W3-B (architecture remediation 2026-10-17) — found while auditing the
-- money ledgers for the wallet merge.
--
-- payout_ledger_entries_source_kind_check (0151) only allowed
--   service_order, voice_clone_license, gift_card, platform_fee,
--   creator_payout, manual_adjustment, commission, partner_program
-- but PayoutLedgerService.recordAccrual also writes promo_project,
-- promo_extra_revision, template_license, course_enrollment,
-- article_pool_distribution, article, timesheet and task — the constraint
-- rejects every such accrual (promo delivery, article payouts, contractor
-- timesheets, paid activities). Production impact (failed accruals) is not
-- verified from here: check for payouts that should have accrued.
--
-- The constraint is widened to shared/creator-earnings.ts
-- PAYOUT_LEDGER_SOURCE_KINDS (the old list ∪ the accrual kinds). Widening
-- only: no existing row can violate it. Idempotent — the old definition is
-- dropped only while it still lacks the new kinds.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payout_ledger_entries_source_kind_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%timesheet%'
  ) THEN
    ALTER TABLE payout_ledger_entries DROP CONSTRAINT IF EXISTS payout_ledger_entries_source_kind_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_ledger_entries_source_kind_check') THEN
    ALTER TABLE payout_ledger_entries ADD CONSTRAINT payout_ledger_entries_source_kind_check
      CHECK (source_kind IS NULL OR source_kind IN (
        'service_order', 'voice_clone_license', 'gift_card', 'platform_fee', 'creator_payout',
        'manual_adjustment', 'commission', 'partner_program', 'promo_project', 'promo_extra_revision',
        'template_license', 'course_enrollment', 'article_pool_distribution', 'article', 'timesheet', 'task'
      )) NOT VALID;
  END IF;
END $$;
