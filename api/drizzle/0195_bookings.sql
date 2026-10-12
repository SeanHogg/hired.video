-- Migration 0195 — Bookings & Reservations (Creator program #7).
--
-- Stands up the calendar-bookable 1:1 sessions surface per
-- docs/prd/bookings-and-reservations.md (gap #1648). The host is a
-- Creator (creator_profiles.bookings_active = true); there is no
-- separate booking_hosts table — host identity is `users.id`.
--
-- Naming: the existing `services` program is the lead-gen / quote /
-- cart-purchase marketplace (routes/services.ts). This new surface
-- uses the `booking_*` prefix and the `bookings` program flag so the
-- two never collide.
--
-- Idempotent per drizzle/TEMPLATE.md.

-- ── creator_profiles.bookings_active flag ─────────────────────────────────
ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS bookings_active boolean NOT NULL DEFAULT false;

-- ── booking_offerings — host's bookable session catalog ───────────────────
-- One row per session type a host offers. Length tiers are restricted to
-- 30 / 60 / 90 / 120 minutes at launch (matches the four lengths the PRD
-- enumerated). Loosen via a follow-up migration if needed.
CREATE TABLE IF NOT EXISTS booking_offerings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                     VARCHAR(120) NOT NULL,
  slug                     VARCHAR(64) NOT NULL,
  duration_minutes         INTEGER NOT NULL CHECK (duration_minutes IN (30, 60, 90, 120)),
  price_cents              INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency                 VARCHAR(3) NOT NULL DEFAULT 'USD',
  description_md           TEXT NOT NULL DEFAULT '',
  video_conference_link    TEXT,
  buffer_before_minutes    INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0 AND buffer_before_minutes <= 240),
  buffer_after_minutes     INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0 AND buffer_after_minutes <= 240),
  is_active                BOOLEAN NOT NULL DEFAULT true,
  display_order            INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_offerings_user_slug
  ON booking_offerings (user_id, slug);
CREATE INDEX IF NOT EXISTS idx_booking_offerings_user_active
  ON booking_offerings (user_id, is_active);

-- ── booking_availability_rules — recurring weekly availability ───────────
-- Times are LOCAL to the host's timezone (users.timezone). The slot-grid
-- resolver projects rules into UTC slots per request.
CREATE TABLE IF NOT EXISTS booking_availability_rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday               SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time_local      TIME NOT NULL,
  end_time_local        TIME NOT NULL,
  effective_from_date   DATE,
  effective_until_date  DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time_local > start_time_local)
);

CREATE INDEX IF NOT EXISTS idx_booking_avail_rules_user_weekday
  ON booking_availability_rules (user_id, weekday);

-- ── booking_availability_overrides — one-off adds + blocks ───────────────
CREATE TABLE IF NOT EXISTS booking_availability_overrides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_local        DATE NOT NULL,
  start_time_local  TIME NOT NULL,
  end_time_local    TIME NOT NULL,
  kind              VARCHAR(8) NOT NULL CHECK (kind IN ('add', 'block')),
  reason            VARCHAR(255),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time_local > start_time_local)
);

CREATE INDEX IF NOT EXISTS idx_booking_avail_overrides_user_date
  ON booking_availability_overrides (user_id, date_local);

-- ── booking_reservations — each booking ───────────────────────────────────
-- magic_link_token is the booker's auth — 256 bits of entropy, URL-safe.
-- No FK on offering_id is required to be NOT NULL (offerings can be
-- soft-deleted while old reservations remain); we keep the integer FK
-- with ON DELETE SET NULL so reservation history survives.
CREATE TABLE IF NOT EXISTS booking_reservations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offering_id              UUID REFERENCES booking_offerings(id) ON DELETE SET NULL,
  offering_name_snapshot   VARCHAR(120) NOT NULL,
  duration_minutes         INTEGER NOT NULL CHECK (duration_minutes IN (30, 60, 90, 120)),
  slot_start_utc           TIMESTAMPTZ NOT NULL,
  slot_end_utc             TIMESTAMPTZ NOT NULL,
  booker_email             VARCHAR(320) NOT NULL,
  booker_name              VARCHAR(255) NOT NULL,
  booker_phone             VARCHAR(40),
  booker_user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  status                   VARCHAR(32) NOT NULL DEFAULT 'pending_payment'
                             CHECK (status IN (
                               'pending_payment', 'confirmed',
                               'cancelled_by_host', 'cancelled_by_booker',
                               'no_show', 'completed', 'refunded'
                             )),
  magic_link_token         VARCHAR(64) NOT NULL,
  payment_intent_id        VARCHAR(255),
  amount_cents             INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  platform_fee_cents       INTEGER NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  currency                 VARCHAR(3) NOT NULL DEFAULT 'USD',
  confirmed_at             TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ,
  cancellation_reason      TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (slot_end_utc > slot_start_utc)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_reservations_magic_link
  ON booking_reservations (magic_link_token);
CREATE INDEX IF NOT EXISTS idx_booking_reservations_user_slot
  ON booking_reservations (user_id, slot_start_utc);
CREATE INDEX IF NOT EXISTS idx_booking_reservations_user_status
  ON booking_reservations (user_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_reservations_booker_email
  ON booking_reservations (booker_email);
-- Optimised slot-grid resolution: pull a host's busy windows in a date range.
CREATE INDEX IF NOT EXISTS idx_booking_reservations_user_status_slot_partial
  ON booking_reservations (user_id, slot_start_utc)
  WHERE status IN ('pending_payment', 'confirmed', 'completed');

-- ── booking_comments — threaded comments on a reservation ─────────────────
CREATE TABLE IF NOT EXISTS booking_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  UUID NOT NULL REFERENCES booking_reservations(id) ON DELETE CASCADE,
  author_kind     VARCHAR(8) NOT NULL CHECK (author_kind IN ('host', 'booker')),
  author_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  body_md         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_comments_reservation
  ON booking_comments (reservation_id, created_at);

-- ── booking_payout_records — per-reservation payout ledger ────────────────
-- One row per Stripe transfer (or other rail). Net-amount cents = amount
-- minus platform fee minus processor fees. Reconciles with PayoutLedgerService
-- on the host's payout_profile.
CREATE TABLE IF NOT EXISTS booking_payout_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id      UUID NOT NULL REFERENCES booking_reservations(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  net_amount_cents    INTEGER NOT NULL CHECK (net_amount_cents >= 0),
  currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
  payout_status       VARCHAR(32) NOT NULL DEFAULT 'pending'
                        CHECK (payout_status IN ('pending', 'in_transit', 'paid', 'failed', 'refunded')),
  external_transfer_id VARCHAR(255),
  transferred_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_payout_records_user
  ON booking_payout_records (user_id);
CREATE INDEX IF NOT EXISTS idx_booking_payout_records_reservation
  ON booking_payout_records (reservation_id);
