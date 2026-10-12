-- Migration 0517 — paid-but-unconfirmed token packs are never lost (gap #2352).
--
-- No new table: `token_pack_purchases` already holds one row per payment
-- reference (unique, 0501) with a `status` column. The confirm use case now
-- records the row as `pending` BEFORE it asks the payment provider about the
-- transaction, then flips it to `paid` (crediting the balance) exactly once —
-- `UPDATE … WHERE status = 'pending'` is the idempotency guard. When the
-- provider check fails transiently the row stays `pending`, and the existing
-- 5-minute cron re-checks a bounded batch of pending rows per run
-- (services/billing/token-packs/tokenPackReconcile.ts).
--
--   status:          pending → paid | rejected | expired   (refunded set by ops)
--   check_attempts:  provider checks so far; the cron gives up (→ expired)
--                    after a fixed number, so a bogus reference can't loop.
--   checked_at:      last provider check, so the cron re-checks the stalest
--                    first and backs off between attempts.
--
-- Existing rows are all `paid` (or admin grants), so nothing is backfilled.

ALTER TABLE token_pack_purchases ADD COLUMN IF NOT EXISTS check_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE token_pack_purchases ADD COLUMN IF NOT EXISTS checked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_token_pack_purchases_pending
  ON token_pack_purchases (checked_at NULLS FIRST, created_at)
  WHERE status = 'pending';
