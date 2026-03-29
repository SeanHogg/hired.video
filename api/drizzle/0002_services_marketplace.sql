-- Migration: Services Marketplace, Lead Generation & PWA Push Notifications
-- Run: apply via psql or the project migration runner

-- ── 1. Add providesServices flag to user profiles ────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS provides_services BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Service Offerings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_offerings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  category      VARCHAR(100),
  price_cents   INTEGER     NOT NULL DEFAULT 0,
  -- price_visible=false means price is shown only after inquiry
  price_visible BOOLEAN     NOT NULL DEFAULT TRUE,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  delivery_days INTEGER,
  image_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Service Inquiries / Leads ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_inquiries (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id         UUID        NOT NULL REFERENCES service_offerings(id) ON DELETE CASCADE,
  from_user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Denormalised from service_offerings.user_id for efficient provider queries
  provider_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message            TEXT,
  -- pending | accepted | rejected | completed
  status             VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- inquiry | purchase
  order_type         VARCHAR(20) NOT NULL DEFAULT 'inquiry',
  paid_amount_cents  INTEGER     NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. PWA Push Subscriptions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL UNIQUE,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
