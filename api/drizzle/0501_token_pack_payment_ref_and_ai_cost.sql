-- Migration 0501 — token packs become purchasable + AI spend becomes visible.
--
-- 1. One payment = one pack credit (gap #2200). The purchase use case
--    (services/billing/token-packs/tokenPackUseCases.ts) inserts the purchase
--    row with ON CONFLICT DO NOTHING and credits the balance only when a row
--    was actually inserted, so a replayed confirm/webhook can't double-credit.
--    `stripe_payment_intent_id` holds the provider transaction id for any
--    provider (name predates Helcim); NULL for SuperAdmin grants.
--    No paid purchase path existed before this migration (grantTokenPack had
--    no production caller), so no duplicate non-null refs can exist.
--
-- 2. Backfill ai_usage_records.cost (it was always written as 0). Rates are
--    the 2026-10-08 list prices from shared/ai-model-rates.ts — the runtime
--    SSoT for every NEW row; this one-time copy only prices history so the
--    SuperAdmin spend view isn't blank on day one. Order mirrors the table:
--    most specific pattern first; unknown models priced like Opus 5.5.

DROP INDEX IF EXISTS token_pack_purchases_stripe_pi_idx;

CREATE UNIQUE INDEX IF NOT EXISTS uq_token_pack_purchases_payment_ref
  ON token_pack_purchases (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

UPDATE ai_usage_records
SET cost = (
  CASE
    WHEN model ~* 'opus[-.]5[-.]5'      THEN prompt_tokens * 4.0  + completion_tokens * 20.0
    WHEN model ~* 'opus'                THEN prompt_tokens * 5.0  + completion_tokens * 25.0
    WHEN model ~* 'sonnet[-.]5[-.]5'    THEN prompt_tokens * 2.0  + completion_tokens * 10.0
    WHEN model ~* 'sonnet'              THEN prompt_tokens * 3.0  + completion_tokens * 15.0
    WHEN model ~* 'haiku'               THEN prompt_tokens * 1.0  + completion_tokens * 5.0
    WHEN model ~* '(:free$)|(^@cf/)'    THEN 0
    WHEN model ~* '^cerebras/'          THEN prompt_tokens * 0.1  + completion_tokens * 0.1
    ELSE                                     prompt_tokens * 4.0  + completion_tokens * 20.0
  END
) / 1000000.0
WHERE cost = 0;
