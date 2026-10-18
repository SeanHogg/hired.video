-- 0591_auth_tokens.sql
--
-- W3-B (architecture remediation 2026-10-17): one table for every one-time
-- authentication token / code.
--
--   old table                   purpose             user_id   email  token  redirect  attempts
--   email_verification_tokens   email_verification  user_id   NULL   token  NULL      0
--   password_reset_tokens       password_reset      user_id   NULL   token  NULL      0
--   magic_link_tokens           magic_link          NULL      email  token  redirect  0
--   two_factor_codes            two_factor          user_id   NULL   code   NULL      attempts
--
-- Each flow keeps its exact semantics: the token/code is stored exactly as
-- before (no re-hashing), expires_at is copied, and `used = true` becomes
-- `used_at = created_at` (the old flag carried no timestamp; NULL = usable).
-- Row ids are kept — a two_factor row id is the login `tempAuthToken`, so
-- in-flight 2FA challenges stay valid across the deploy. Idempotent: ON
-- CONFLICT DO NOTHING on the carried id.
--
-- The old tables are archived by 0595 (after a final catch-up copy).

CREATE TABLE IF NOT EXISTS auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose     varchar(24) NOT NULL,
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  email       varchar(255),
  token       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  attempts    integer NOT NULL DEFAULT 0,
  redirect    varchar(500),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_tokens_purpose_token ON auth_tokens (purpose, token) WHERE purpose <> 'two_factor';
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_purpose ON auth_tokens (user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_email_purpose ON auth_tokens (email, purpose) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens (expires_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_tokens_purpose_check') THEN
    ALTER TABLE auth_tokens ADD CONSTRAINT auth_tokens_purpose_check
      CHECK (purpose IN ('email_verification', 'password_reset', 'magic_link', 'two_factor')) NOT VALID;
  END IF;
END $$;

-- Copy one token table. `p_select` yields, in order:
--   id, user_id, email, token, expires_at, used_at, attempts, redirect, created_at
CREATE OR REPLACE FUNCTION public.__mig_0591_backfill_tokens(p_source text, p_purpose text, p_select text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF to_regclass('public.' || p_source) IS NULL THEN RETURN; END IF;
  EXECUTE format($q$
    INSERT INTO public.auth_tokens (id, purpose, user_id, email, token, expires_at, used_at, attempts, redirect, created_at)
    SELECT id, %L, user_id, email, token, expires_at, used_at, attempts, redirect, created_at
    FROM (SELECT %s FROM public.%I) AS src
    ON CONFLICT DO NOTHING
  $q$, p_purpose, p_select, p_source);
END;
$fn$;

SELECT public.__mig_0591_backfill_tokens('email_verification_tokens', 'email_verification',
  'id, user_id, NULL::varchar AS email, token, expires_at,
   CASE WHEN used THEN created_at END AS used_at, 0 AS attempts, NULL::varchar AS redirect, created_at');

SELECT public.__mig_0591_backfill_tokens('password_reset_tokens', 'password_reset',
  'id, user_id, NULL::varchar AS email, token, expires_at,
   CASE WHEN used THEN created_at END AS used_at, 0 AS attempts, NULL::varchar AS redirect, created_at');

SELECT public.__mig_0591_backfill_tokens('magic_link_tokens', 'magic_link',
  'id, NULL::uuid AS user_id, email, token, expires_at,
   CASE WHEN used THEN created_at END AS used_at, 0 AS attempts, redirect, created_at');

SELECT public.__mig_0591_backfill_tokens('two_factor_codes', 'two_factor',
  'id, user_id, NULL::varchar AS email, code AS token, expires_at,
   CASE WHEN used THEN created_at END AS used_at, COALESCE(attempts, 0) AS attempts, NULL::varchar AS redirect, created_at');

DROP FUNCTION IF EXISTS public.__mig_0591_backfill_tokens(text, text, text);
