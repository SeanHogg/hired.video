-- Migration 0092 — payout ledger + onboarding state + schema-drift cleanup.
--
-- Closes the CFO/CTO "no payout pipeline" blocker (README CFO §) for the
-- onboarding + ledger portion. Adds:
--
--   1. `payout_ledger_entries`  — append-only double-entry source of truth
--      for every creator-balance movement (accrual / payout / reversal /
--      adjustment). Replaces the loose `creator_profiles.total_earned_cents`
--      counter that nothing decremented.
--
--   2. `payouts`                — one row per outbound disbursement attempt.
--      The release worker (deferred to next pass) will INSERT 'queued' rows;
--      the provider client moves them through attempting -> sent -> settled
--      / failed via webhook callbacks.
--
--   3. `payout_profiles` extensions:
--        - `payouts_enabled`          — set by the onboarding flow on success
--        - `tax_id_ciphertext` BYTEA  — AES-GCM ciphertext (replaces the
--          plain-text `tax_id_encrypted` placeholder; the text column stays
--          NULLable for backfill rather than dropped, so an in-flight value
--          isn't lost between deploy + backfill)
--        - `tax_id_nonce` BYTEA       — per-row 12-byte GCM nonce
--        - `tax_id_kms_key_id` TEXT   — which KMS key was used (rotation)
--        - `account_hint` JSONB       — last4 / bankName / accountType for UI
--
--   4. `creator_profiles` schema-drift cleanup — the per-creator-row table
--      duplicated payout_provider / payout_account_id / payout_onboarded_at /
--      payout_country / payout_currency from payout_profiles. Those columns
--      are dropped here so payout_profiles is the single source of truth
--      ("taxes follow the person"). `total_earned_cents` stays as a cached
--      denormalisation backed by the ledger.
--
--   5. `affiliate_payouts` is intentionally NOT touched — that's a separate
--      legacy table and the Partner Program payout migration ships in its
--      own pass once Tremendous bulk-orders is wired (#174).

CREATE TABLE IF NOT EXISTS "payout_ledger_entries" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,

  -- Positive cents accrue, negative cents debit. We choose signed amounts
  -- over separate debit/credit columns so balance = SUM(amount_cents).
  "amount_cents" INTEGER NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',

  -- 'accrual'    — earned from a completed sale (positive)
  -- 'payout'     — disbursed via a payout (negative; written when payout
  --                row moves to 'sent' so balance reflects funds in flight)
  -- 'reversal'   — failed payout returned to balance (positive; pairs with
  --                a prior 'payout' entry by source_payout_id)
  -- 'adjustment' — manual admin correction; always carries a note
  "kind" VARCHAR(16) NOT NULL,

  -- Provenance — what business event produced this entry. Open-ended so
  -- new revenue surfaces (voice marketplace, templates, services, etc.)
  -- can write without a schema change. NULL for adjustments.
  "source_kind" VARCHAR(32),
  "source_id" UUID,
  "source_payout_id" UUID,  -- set on 'payout' and 'reversal' entries

  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_payout_ledger_user_created"
  ON "payout_ledger_entries" ("user_id", "created_at" DESC);

-- Idempotency guard: a given business event should produce at most one
-- accrual entry. (source_kind, source_id) is the natural key for accruals.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payout_ledger_accrual_source"
  ON "payout_ledger_entries" ("source_kind", "source_id")
  WHERE "kind" = 'accrual' AND "source_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "payouts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,

  "amount_cents" INTEGER NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',

  -- Rail used. Mirrors payout_profiles.payout_provider at the time the
  -- payout row was created (creator may switch rails later; historical
  -- payouts must retain their original rail).
  "provider" VARCHAR(32) NOT NULL,
  "provider_account_id" TEXT NOT NULL,
  "provider_payout_id" TEXT,   -- set on first successful API call
  "provider_status" VARCHAR(64),

  -- Lifecycle:
  --   queued    — release worker emitted the row; not yet sent to provider
  --   attempting — API call in flight
  --   sent      — provider accepted; webhook will confirm settlement
  --   settled   — provider confirmed funds landed (Helcim ACH effective date,
  --               Tremendous order delivered)
  --   failed    — provider rejected or webhook reported failure
  --   reversed  — settled then later returned (ACH NSF, gift-card void)
  "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
  "attempted_at" TIMESTAMPTZ,
  "sent_at" TIMESTAMPTZ,
  "settled_at" TIMESTAMPTZ,
  "failed_at" TIMESTAMPTZ,
  "reversed_at" TIMESTAMPTZ,
  "failure_reason" TEXT,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_payouts_user_status"
  ON "payouts" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "idx_payouts_provider_payout_id"
  ON "payouts" ("provider", "provider_payout_id")
  WHERE "provider_payout_id" IS NOT NULL;

-- payout_profiles extensions ------------------------------------------------

ALTER TABLE "payout_profiles"
  ADD COLUMN IF NOT EXISTS "payouts_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "tax_id_ciphertext" BYTEA,
  ADD COLUMN IF NOT EXISTS "tax_id_nonce" BYTEA,
  ADD COLUMN IF NOT EXISTS "tax_id_kms_key_id" TEXT,
  ADD COLUMN IF NOT EXISTS "account_hint" JSONB,
  ADD COLUMN IF NOT EXISTS "min_payout_threshold_cents" INTEGER NOT NULL DEFAULT 5000;
  -- 5000 = $50 default per README §1938. Per-user override lets us soft-launch
  -- with a higher floor for specific accounts without a config change.

-- creator_profiles schema-drift cleanup -------------------------------------
-- Payout / tax info lives on payout_profiles (one row per user). The same
-- columns existed on creator_profiles (one row per creator-program-enrollment)
-- which made the question "where do I read the bank account from?" ambiguous
-- and meant cancelling + re-enrolling in the program orphaned the bank info.
-- Drop the duplicates. Reads that previously joined creator_profiles for
-- payout_account_id are migrated to payout_profiles in the same change set.

ALTER TABLE "creator_profiles"
  DROP COLUMN IF EXISTS "payout_provider",
  DROP COLUMN IF EXISTS "payout_account_id",
  DROP COLUMN IF EXISTS "payout_onboarded_at",
  DROP COLUMN IF EXISTS "payout_country",
  DROP COLUMN IF EXISTS "payout_currency";

-- The plaintext placeholder `tax_id_encrypted` column on payout_profiles
-- stays for one deploy so any in-flight values survive the backfill window.
-- A follow-up migration (tracked in the Gap Register) drops it once
-- ciphertext + nonce backfill has been verified.
