-- Migration: 0025_cookie_preferences
-- Adds the cookie_preferences table so the /cookies consent panel and the
-- Settings → Cookies tab can persist per-user choices. Previously the
-- CookiePolicy page kept state in a React useState so preferences were
-- lost on refresh and there was no per-account source of truth.
--
-- Essential cookies are always on and intentionally NOT stored as a column
-- (they are required for the site to function). Only the optional categories
-- are persisted.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "cookie_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "analytics" boolean NOT NULL DEFAULT false,
  "marketing" boolean NOT NULL DEFAULT false,
  "personalization" boolean NOT NULL DEFAULT false,
  "consented_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
