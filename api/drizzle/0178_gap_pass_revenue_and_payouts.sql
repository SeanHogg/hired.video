-- 0178 — multi-gap revenue + payouts pass (#227, #310, #312, #631, #773, #809,
-- #100, #896, #177, #96, #386).
--
-- Schema-only changes:
--   #227 — placements.fee_mode / fee_flat_cents / fee_percent_bps so the
--          commission engine can dispatch on flat vs percent without
--          inferring from numeric(commission_amount).
--   #809 — inbox_seat_addons: paid extra-inbox slots per user; the cap
--          read in routes/email-integration.ts becomes
--          (INBOX_SYNC_INCLUDED_ACCOUNTS + addon.quantity).
--   #100 — outplacement_seats + outplacement_enrollments: employer-paid
--          B2B product. Bulk seat purchase, per-seat email assignment,
--          and a duration-bounded entitlement override.
--   #896 — article_payout_periods + article_payout_runs: per-period
--          accruals against per-article engagement (view_count +
--          read_minutes) so the existing payouts ledger picks up
--          article revenue without bespoke columns elsewhere.
--   #177 — boost_checkouts: ledger-style record of every paid boost
--          purchase. Captures the Campaign $ debit + USD charge split
--          so refunds / disputes are reconstructable.
--   #96  — enrichment_provider_calls: per-attempt log of upstream
--          enrichment calls. Lets us pin provider drift (rate-limit
--          errors, schema changes) without leaking provider choice
--          into the credit-deduction path.

BEGIN;

-- ---------------------------------------------------------------------------
-- #227 — placements: explicit fee-mode discriminator
-- ---------------------------------------------------------------------------
ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS fee_mode varchar(8),
  ADD COLUMN IF NOT EXISTS fee_flat_cents integer,
  ADD COLUMN IF NOT EXISTS fee_percent_bps integer;

-- Backfill mode from existing data. Rows with a non-zero
-- commission_amount and zero percentage are flat; everything else
-- defaults to percent (matches today's engine behaviour).
UPDATE placements
   SET fee_mode = CASE
     WHEN fee_mode IS NOT NULL THEN fee_mode
     WHEN (commission_amount IS NOT NULL AND commission_amount::numeric > 0)
          AND (commission_percentage IS NULL OR commission_percentage::numeric = 0)
       THEN 'flat'
     ELSE 'percent'
   END
 WHERE fee_mode IS NULL;

-- Mirror existing commission_* into the new cents/bps columns so the
-- engine sees identical numbers on first read after deploy.
UPDATE placements
   SET fee_percent_bps = COALESCE(fee_percent_bps,
                                  ROUND(commission_percentage::numeric * 100))
 WHERE fee_mode = 'percent';

UPDATE placements
   SET fee_flat_cents = COALESCE(fee_flat_cents,
                                 ROUND(commission_amount::numeric * 100))
 WHERE fee_mode = 'flat';

ALTER TABLE placements
  ALTER COLUMN fee_mode SET DEFAULT 'percent',
  ALTER COLUMN fee_mode SET NOT NULL;

-- ADD CONSTRAINT gated by pg_constraint per TEMPLATE.md rule #2;
-- NOT VALID per rule #5 so existing rows aren't validated mid-migration
-- (the UPDATE above + the SET DEFAULT/NOT NULL above guarantee every
-- row is already in the allowed set, but the runner's idempotency
-- contract is what the rule protects).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'placements_fee_mode_chk') THEN
    ALTER TABLE placements
      ADD CONSTRAINT placements_fee_mode_chk
      CHECK (fee_mode IN ('flat', 'percent')) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- #809 — paid extra inbox slots above the 3 included with Pro
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inbox_seat_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0
    CHECK (quantity >= 0 AND quantity <= 50),
  -- Helcim recurring-plan / subscription-line ID we mirror updates from.
  provider_subscription_id text,
  unit_price_cents integer NOT NULL DEFAULT 500,
  status varchar(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'past_due')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_seat_addons_status
  ON inbox_seat_addons(status);

-- ---------------------------------------------------------------------------
-- #100 — outplacement product
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outplacement_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employer_company_id uuid REFERENCES company_profiles(id) ON DELETE SET NULL,
  seat_count integer NOT NULL CHECK (seat_count > 0 AND seat_count <= 5000),
  seats_assigned integer NOT NULL DEFAULT 0
    CHECK (seats_assigned >= 0 AND seats_assigned <= seat_count),
  duration_days integer NOT NULL CHECK (duration_days IN (90, 180, 365)),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  total_cents integer NOT NULL,
  provider_payment_id text,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outplacement_packages_employer
  ON outplacement_packages(employer_user_id, status);

CREATE TABLE IF NOT EXISTS outplacement_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES outplacement_packages(id) ON DELETE CASCADE,
  candidate_email text NOT NULL,
  candidate_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  starts_at timestamptz,
  expires_at timestamptz,
  status varchar(16) NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'completed', 'expired', 'revoked')),
  completion_metric jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_outplacement_enrollments_package_email
  ON outplacement_enrollments(package_id, lower(candidate_email));

CREATE INDEX IF NOT EXISTS idx_outplacement_enrollments_user
  ON outplacement_enrollments(candidate_user_id) WHERE candidate_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- #896 — article engagement payout periods + per-run accruals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS article_payout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  -- USD cents paid per 1,000 qualifying read-minutes. Configurable per run
  -- so the rate can move without rewriting historical rows.
  cents_per_1k_read_minutes integer NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_credited_cents integer NOT NULL DEFAULT 0,
  articles_paid integer NOT NULL DEFAULT 0,
  ran_at timestamptz,
  failed_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_article_payout_runs_period
  ON article_payout_runs(period_start, period_end);

CREATE TABLE IF NOT EXISTS article_payout_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES article_payout_runs(id) ON DELETE CASCADE,
  article_id uuid NOT NULL,
  creator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qualifying_read_minutes integer NOT NULL DEFAULT 0,
  qualifying_view_count integer NOT NULL DEFAULT 0,
  cents_credited integer NOT NULL DEFAULT 0,
  ledger_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_article_payout_entries_creator
  ON article_payout_entries(creator_user_id);

-- ---------------------------------------------------------------------------
-- #177 — paid boost checkout ledger (USD / Campaign $ split)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boost_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  boost_id uuid REFERENCES boosts(id) ON DELETE SET NULL,
  total_cents integer NOT NULL,
  campaign_dollars_cents integer NOT NULL DEFAULT 0,
  usd_cents integer NOT NULL DEFAULT 0,
  provider_payment_id text,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boost_checkouts_user
  ON boost_checkouts(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- #96 — enrichment provider calls audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrichment_provider_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL,
  target_email text,
  target_domain text,
  ok boolean NOT NULL,
  http_status integer,
  credits_consumed integer NOT NULL DEFAULT 0,
  response_excerpt text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_provider_calls_user
  ON enrichment_provider_calls(user_id, created_at DESC);

COMMIT;
