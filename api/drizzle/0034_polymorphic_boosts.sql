-- Migration: 0034_polymorphic_boosts
--
-- Phase C of the polymorphic content rollout. One `boosts` table for
-- "promote any user-generated thing": reviews, feed posts, videos,
-- resumes, voice clones, and (eventually) the existing job_boosts +
-- company_boosts. The (subject_type, subject_id) pair is the
-- discriminator; each subject type gets a descriptor in
-- shared/reviews/subject-descriptors.ts (or a sibling registry — to
-- be expanded as more types opt in).
--
-- Stripe payment-intent wiring is deferred. The existing
-- `job_boosts` + `company_boosts` rows insert with status='active'
-- and a NULL `stripe_payment_intent_id` — i.e. payment isn't actually
-- collected today. This migration matches that state for the
-- generic table; the API exposes the column so a future PR can wire
-- payment_intent creation + a webhook handler in `payment.ts` for
-- ALL boost types in one pass.
--
-- The legacy `job_boosts` + `company_boosts` tables are left in
-- place; their existing read/write code paths continue to work. A
-- later migration can fold them in once the Stripe wiring is unified.

CREATE TABLE IF NOT EXISTS boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  subject_type varchar(32) NOT NULL,
  subject_id   uuid        NOT NULL,

  -- 'feed_top' | 'discovery' | 'sidebar' | 'all' — surface where the
  -- boost shows. Free-form so new placements don't need a migration.
  placement_type varchar(32) NOT NULL DEFAULT 'feed_top',
  -- 'flat' | 'cpm' | 'cpc' — pricing model. Mirrors job_boosts.
  pricing_model  varchar(16) NOT NULL DEFAULT 'flat',

  budget_cents     integer NOT NULL CHECK (budget_cents >= 100), -- $1 minimum
  spent_cents      integer NOT NULL DEFAULT 0,
  rate_unit_cents  integer,

  -- Lifecycle:
  --   pending_payment → active → completed   (success path)
  --   pending_payment → failed              (Stripe declined)
  --   active          → paused / cancelled  (user toggled)
  status varchar(20) NOT NULL DEFAULT 'pending_payment',

  -- Performance counters, written by the impression / click
  -- pipelines (out of scope for v1).
  impressions integer NOT NULL DEFAULT 0,
  clicks      integer NOT NULL DEFAULT 0,

  stripe_payment_intent_id text,

  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at   timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boosts_subject
  ON boosts (subject_type, subject_id);

CREATE INDEX IF NOT EXISTS idx_boosts_user
  ON boosts (user_id);

-- Active-by-status filter — used when the placement pipeline asks
-- "which boosts are eligible for this surface right now?".
CREATE INDEX IF NOT EXISTS idx_boosts_status_active
  ON boosts (status, ends_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_boosts_stripe_pi
  ON boosts (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
