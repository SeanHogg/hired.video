-- #1604 DB-half — CHECK constraint on every `*_enc` column enforcing one
-- of the three known ciphertext formats (new v1 prefix + 2 legacy formats
-- the shared crypto module tolerates on read). The constraint stops a
-- future writer that bypasses the service layer from inserting plaintext.
--
-- Once natural OAuth-token rotation re-encrypts every legacy row through
-- the new format, a separate migration can tighten the CHECK to only
-- accept the v1 prefix and shed the legacy clauses.
--
-- All CHECKs added as NOT VALID so existing rows aren't validated; new
-- writes are gated. Run `VALIDATE CONSTRAINT … ` after backfill confirms
-- all live rows match one of the three patterns.

-- Helper: install the same CHECK shape on N tables. Pattern is:
--   - new format         : starts with 'v1.aes-gcm.hkdf:'
--   - paid-media legacy  : `b64iv.b64ct` — dot-separated, two base64 chunks
--   - email-integration  : `hexiv:hexct` — colon-separated, hex
CREATE OR REPLACE FUNCTION public.__mig_0157_add_enc_check(target_table text, target_col text)
RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  constraint_name text := target_table || '_' || target_col || '_enc_format_check';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = constraint_name) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (
         %I IS NULL
         OR %I LIKE %L
         OR %I ~ %L
         OR %I ~ %L
       ) NOT VALID',
      target_table, constraint_name,
      target_col,
      target_col, 'v1.aes-gcm.hkdf:%',
      -- paid-media legacy: base64.base64 (no colon, contains a single dot)
      target_col, '^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$',
      -- email legacy: hex:hex
      target_col, '^[0-9a-fA-F]+:[0-9a-fA-F]+$'
    );
  END IF;
END;
$func$;

-- paid_media_connections — both columns.
SELECT public.__mig_0157_add_enc_check('paid_media_connections', 'access_token_enc');
SELECT public.__mig_0157_add_enc_check('paid_media_connections', 'refresh_token_enc');

-- paid_media_pixels — five provider-specific encrypted columns.
DO $$
DECLARE
  col text;
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'paid_media_pixels'
      AND column_name LIKE '%_enc'
  LOOP
    PERFORM public.__mig_0157_add_enc_check('paid_media_pixels', col);
  END LOOP;
END $$;

-- external_email_accounts.oauth_refresh_token_enc — live inbox surface.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'external_email_accounts' AND column_name = 'oauth_refresh_token_enc'
  ) THEN
    PERFORM public.__mig_0157_add_enc_check('external_email_accounts', 'oauth_refresh_token_enc');
  END IF;
END $$;

-- company_integrations — both columns (workforce OAuth, populated once
-- #1614 lands).
SELECT public.__mig_0157_add_enc_check('company_integrations', 'access_token_enc');
SELECT public.__mig_0157_add_enc_check('company_integrations', 'refresh_token_enc');

-- calendar_connections — when present, has access_token / refresh_token
-- which may not be _enc-suffixed; check both.
DO $$
DECLARE
  col text;
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'calendar_connections'
      AND column_name LIKE '%token%enc%'
  LOOP
    PERFORM public.__mig_0157_add_enc_check('calendar_connections', col);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.__mig_0157_add_enc_check(text, text);
