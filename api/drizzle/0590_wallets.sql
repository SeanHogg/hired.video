-- 0590_wallets.sql
--
-- W3-B (architecture remediation 2026-10-17): ONE wallet model.
--
--   wallet_balances  one row per (owner_kind, owner_id, currency_kind)
--   wallet_ledger    append-only movements (currencies that keep an audit trail)
--
-- Backfilled here, in this file, from every retired table:
--
--   balance table             owner    currency            balance        lifetime_granted         lifetime_consumed
--   user_token_balance        user     ai_tokens           balance        lifetime_granted         lifetime_consumed
--   company_token_balance     company  ai_tokens           balance        lifetime_granted         lifetime_consumed
--   enrichment_credits        user     enrichment_credits  balance        total_purchased          total_consumed
--   campaign_dollars_balance  user     campaign_dollars    balance_cents  lifetime_granted_cents   lifetime_spent_cents
--   partner_program_balances  user     partner_pool        pending_cents  pending + paid           paid_cents
--   user_points_balance       user     points              balance        lifetime_earned          lifetime_redeemed (+ lifetime_reversed)
--   phone_balances            user     phone_cents         balance_cents  0                        0
--
--   ledger table                   currency            type      amount        balance_after
--   enrichment_transactions        enrichment_credits  type      amount        balance_after
--   campaign_dollars_transactions  campaign_dollars    kind      amount_cents  balance_after_cents
--   phone_balance_transactions     phone_cents         type      amount_cents  balance_cents_after
--   points_ledger                  points              category  delta         NULL  (+ action, source, reverses_id, metadata)
--
-- Every old row keeps its id (ledger + balance rows), so references to them
-- stay valid. Idempotent: every insert is ON CONFLICT DO NOTHING, and each
-- source is copied by ONE statement that also writes what it copied into
-- archive.wallet_backfill_0590 — the snapshot 0595 uses to carry over any
-- change the old Worker makes between this migration and the new Worker going
-- live (migrations run before `wrangler deploy`).
--
-- Not merged: payout_ledger_entries. Its balance is derived (SUM of entries
-- joined to payouts.status), entries carry a per-row fiat currency, accrual
-- idempotency is a uuid (source_kind, source_id) pair, and no entry has a
-- running balance — folding it into wallet_ledger would add four payout-only
-- columns and a meaningless balance_after for no shared behaviour.
--
-- Verification (old vs new sums/counts, per source):
--   node --import tsx scripts/verify-wallet-merge.ts
-- Pre-deploy check that no historical ledger type would trip the new CHECK:
--   node --import tsx scripts/verify-wallet-merge.ts --preflight

CREATE TABLE IF NOT EXISTS wallet_balances (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_kind                varchar(16) NOT NULL,
  owner_id                  uuid NOT NULL,
  currency_kind             varchar(24) NOT NULL,
  balance                   integer NOT NULL DEFAULT 0,
  lifetime_granted          integer NOT NULL DEFAULT 0,
  lifetime_consumed         integer NOT NULL DEFAULT 0,
  lifetime_reversed         integer NOT NULL DEFAULT 0,
  is_suspended              boolean NOT NULL DEFAULT false,
  suspended_at              timestamptz,
  suspended_reason          text,
  suspended_by              uuid REFERENCES users(id) ON DELETE SET NULL,
  rate_cents_per_1k_points  integer,
  last_period_id            uuid,
  auto_top_up_enabled       boolean,
  auto_top_up_threshold     integer,
  auto_top_up_amount        integer,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_balances_owner_currency ON wallet_balances (owner_kind, owner_id, currency_kind);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_currency ON wallet_balances (currency_kind);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_suspended ON wallet_balances (is_suspended) WHERE is_suspended = true;
CREATE INDEX IF NOT EXISTS idx_wallet_balances_suspended_by ON wallet_balances (suspended_by);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_balances_owner_kind_check') THEN
    ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_owner_kind_check
      CHECK (owner_kind IN ('user', 'company')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_balances_currency_kind_check') THEN
    ALTER TABLE wallet_balances ADD CONSTRAINT wallet_balances_currency_kind_check
      CHECK (currency_kind IN ('ai_tokens', 'enrichment_credits', 'campaign_dollars', 'partner_pool', 'points', 'phone_cents')) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_kind      varchar(16) NOT NULL,
  owner_id        uuid NOT NULL,
  currency_kind   varchar(24) NOT NULL,
  type            varchar(32) NOT NULL,
  amount          integer NOT NULL,
  balance_after   integer,
  reference_type  varchar(40),
  reference_id    text,
  description     text,
  action          varchar(80),
  source          varchar(40),
  reverses_id     uuid,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_owner_created ON wallet_ledger (owner_kind, owner_id, currency_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_reference ON wallet_ledger (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_action ON wallet_ledger (action) WHERE action IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ledger_points_dedup ON wallet_ledger (owner_id, action, reference_id, type)
  WHERE currency_kind = 'points' AND reference_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_ledger_owner_kind_check') THEN
    ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_owner_kind_check
      CHECK (owner_kind IN ('user', 'company')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_ledger_currency_kind_check') THEN
    ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_currency_kind_check
      CHECK (currency_kind IN ('ai_tokens', 'enrichment_credits', 'campaign_dollars', 'partner_pool', 'points', 'phone_cents')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_ledger_type_check') THEN
    ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_type_check
      CHECK (type IN ('purchase', 'deduction', 'refund', 'monthly_grant', 'grant_redemption', 'boost_spend', 'ad_spend', 'call_charge', 'sms_charge', 'earn', 'redeem', 'adjust', 'reverse', 'streak_bonus', 'badge_bonus')) NOT VALID;
  END IF;
END $$;

-- A user's wallets go with the user, as the per-user tables' ON DELETE
-- CASCADE did (owner_id is polymorphic, so no FK can do it).
CREATE OR REPLACE FUNCTION wallet_owner_user_delete() RETURNS trigger AS $body$
BEGIN
  DELETE FROM wallet_ledger WHERE owner_kind = 'user' AND owner_id = OLD.id;
  DELETE FROM wallet_balances WHERE owner_kind = 'user' AND owner_id = OLD.id;
  RETURN OLD;
END
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallet_owner_user_delete ON users;
CREATE TRIGGER trg_wallet_owner_user_delete
  AFTER DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION wallet_owner_user_delete();

-- ── Backfill snapshot (read by 0595 and scripts/verify-wallet-merge.ts) ──
CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS archive.wallet_backfill_0590 (
  source_table       text NOT NULL,
  owner_id           uuid NOT NULL,
  balance            bigint NOT NULL,
  lifetime_granted   bigint NOT NULL,
  lifetime_consumed  bigint NOT NULL,
  lifetime_reversed  bigint NOT NULL,
  state              jsonb NOT NULL DEFAULT '{}'::jsonb,
  taken_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_table, owner_id)
);

-- Copy one balance table: insert its rows into wallet_balances AND record the
-- copied values in the snapshot, in ONE statement (both read the same
-- snapshot of the source). `p_select` must yield, in order:
--   id, owner_id, balance, lifetime_granted, lifetime_consumed, lifetime_reversed,
--   is_suspended, suspended_at, suspended_reason, suspended_by,
--   rate_cents_per_1k_points, last_period_id,
--   auto_top_up_enabled, auto_top_up_threshold, auto_top_up_amount,
--   created_at, updated_at
-- A source table that does not exist in this database is skipped.
CREATE OR REPLACE FUNCTION public.__mig_0590_backfill_wallet(
  p_source text, p_owner_kind text, p_currency text, p_select text, p_where text
) RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF to_regclass('public.' || p_source) IS NULL THEN RETURN; END IF;
  EXECUTE format($q$
    WITH src AS (
      SELECT %s FROM public.%I WHERE %s
    ),
    ins AS (
      INSERT INTO public.wallet_balances
        (id, owner_kind, owner_id, currency_kind, balance, lifetime_granted, lifetime_consumed, lifetime_reversed,
         is_suspended, suspended_at, suspended_reason, suspended_by, rate_cents_per_1k_points, last_period_id,
         auto_top_up_enabled, auto_top_up_threshold, auto_top_up_amount, created_at, updated_at)
      SELECT id, %L, owner_id, %L, balance, lifetime_granted, lifetime_consumed, lifetime_reversed,
         is_suspended, suspended_at, suspended_reason, suspended_by, rate_cents_per_1k_points, last_period_id,
         auto_top_up_enabled, auto_top_up_threshold, auto_top_up_amount, created_at, updated_at
      FROM src
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    INSERT INTO archive.wallet_backfill_0590
      (source_table, owner_id, balance, lifetime_granted, lifetime_consumed, lifetime_reversed, state)
    SELECT %L, owner_id, balance, lifetime_granted, lifetime_consumed, lifetime_reversed,
           jsonb_build_object(
             'is_suspended', is_suspended, 'suspended_at', suspended_at, 'suspended_reason', suspended_reason,
             'suspended_by', suspended_by, 'rate_cents_per_1k_points', rate_cents_per_1k_points,
             'last_period_id', last_period_id, 'auto_top_up_enabled', auto_top_up_enabled,
             'auto_top_up_threshold', auto_top_up_threshold, 'auto_top_up_amount', auto_top_up_amount)
    FROM src
    ON CONFLICT DO NOTHING
  $q$, p_select, p_source, p_where, p_owner_kind, p_currency, p_source);
END;
$fn$;

SELECT public.__mig_0590_backfill_wallet('user_token_balance', 'user', 'ai_tokens',
  'id, user_id AS owner_id, balance, lifetime_granted, lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   NULL::integer AS rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'TRUE');

SELECT public.__mig_0590_backfill_wallet('company_token_balance', 'company', 'ai_tokens',
  'id, company_id AS owner_id, balance, lifetime_granted, lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   NULL::integer AS rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'TRUE');

SELECT public.__mig_0590_backfill_wallet('enrichment_credits', 'user', 'enrichment_credits',
  'id, user_id AS owner_id, balance, total_purchased AS lifetime_granted, total_consumed AS lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   NULL::integer AS rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'TRUE');

SELECT public.__mig_0590_backfill_wallet('campaign_dollars_balance', 'user', 'campaign_dollars',
  'id, user_id AS owner_id, balance_cents AS balance, lifetime_granted_cents AS lifetime_granted,
   lifetime_spent_cents AS lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   created_at, updated_at',
  'TRUE');

-- pending = spendable balance; paid = paid out; pending + paid = all accrued.
SELECT public.__mig_0590_backfill_wallet('partner_program_balances', 'user', 'partner_pool',
  'gen_random_uuid() AS id, user_id AS owner_id, pending_cents AS balance, pending_cents + paid_cents AS lifetime_granted,
   paid_cents AS lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   NULL::integer AS rate_cents_per_1k_points, last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'TRUE');

SELECT public.__mig_0590_backfill_wallet('user_points_balance', 'user', 'points',
  'id, user_id AS owner_id, balance, lifetime_earned AS lifetime_granted, lifetime_redeemed AS lifetime_consumed, lifetime_reversed,
   is_suspended, suspended_at, suspended_reason, suspended_by,
   NULL::integer AS rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'TRUE');

-- phone_balances.user_id is text: only uuid-shaped values can become an
-- owner_id. Any other row stays in archive.phone_balances (the verify
-- script reports it).
SELECT public.__mig_0590_backfill_wallet('phone_balances', 'user', 'phone_cents',
  'id, user_id::uuid AS owner_id, balance_cents AS balance, 0 AS lifetime_granted, 0 AS lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   NULL::integer AS rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   auto_top_up_enabled, auto_top_up_threshold_cents AS auto_top_up_threshold, auto_top_up_amount_cents AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'user_id::text ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''');

DROP FUNCTION IF EXISTS public.__mig_0590_backfill_wallet(text, text, text, text, text);

-- Copy one ledger table (ids kept; a re-run skips rows already copied).
-- `p_select` must yield, in order:
--   id, owner_id, type, amount, balance_after, reference_type, reference_id,
--   description, action, source, reverses_id, metadata, created_at
CREATE OR REPLACE FUNCTION public.__mig_0590_backfill_ledger(
  p_source text, p_currency text, p_select text, p_where text
) RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF to_regclass('public.' || p_source) IS NULL THEN RETURN; END IF;
  EXECUTE format($q$
    INSERT INTO public.wallet_ledger
      (id, owner_kind, owner_id, currency_kind, type, amount, balance_after, reference_type, reference_id,
       description, action, source, reverses_id, metadata, created_at)
    SELECT id, 'user', owner_id, %L, type, amount, balance_after, reference_type, reference_id,
       description, action, source, reverses_id, metadata, created_at
    FROM (SELECT %s FROM public.%I WHERE %s) AS src
    ON CONFLICT DO NOTHING
  $q$, p_currency, p_select, p_source, p_where);
END;
$fn$;

SELECT public.__mig_0590_backfill_ledger('enrichment_transactions', 'enrichment_credits',
  'id, user_id AS owner_id, type::varchar AS type, amount, balance_after, NULL::varchar AS reference_type, reference_id,
   description, NULL::varchar AS action, NULL::varchar AS source, NULL::uuid AS reverses_id, NULL::jsonb AS metadata, created_at',
  'TRUE');

SELECT public.__mig_0590_backfill_ledger('campaign_dollars_transactions', 'campaign_dollars',
  'id, user_id AS owner_id, kind::varchar AS type, amount_cents AS amount, balance_after_cents AS balance_after,
   reference_type, reference_id, description, NULL::varchar AS action, NULL::varchar AS source,
   NULL::uuid AS reverses_id, NULL::jsonb AS metadata, created_at',
  'TRUE');

SELECT public.__mig_0590_backfill_ledger('phone_balance_transactions', 'phone_cents',
  'id, user_id::text::uuid AS owner_id, type::text::varchar AS type, amount_cents AS amount, balance_cents_after AS balance_after,
   NULL::varchar AS reference_type, reference_id, description, NULL::varchar AS action, NULL::varchar AS source,
   NULL::uuid AS reverses_id, NULL::jsonb AS metadata, created_at',
  'user_id::text ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''');

SELECT public.__mig_0590_backfill_ledger('points_ledger', 'points',
  'id, user_id AS owner_id, category::varchar AS type, delta AS amount, NULL::integer AS balance_after,
   ref_type AS reference_type, ref_id AS reference_id, NULL::text AS description,
   action, source, reverses_id, metadata, created_at',
  'TRUE');

DROP FUNCTION IF EXISTS public.__mig_0590_backfill_ledger(text, text, text, text);
