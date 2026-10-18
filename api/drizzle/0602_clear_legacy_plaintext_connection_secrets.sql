-- @owner-gated
-- 0602_clear_legacy_plaintext_connection_secrets.sql
--
-- W3-C provider connections: last step of the credential encryption rollout
-- (replaces 0549 / 0578, whose tables 0601 archived).
--
-- Rule: populate first, then clear. This file NEVER deletes a credential.
--
--   * provider_connections is not touched. A `legacy:plain:<value>` there is
--     the only live copy of that secret; it is re-sealed in place under
--     CREDENTIALS_KMS_KEY by reads (services/provider-connections/
--     connection-secrets.ts) and by scripts/backfill-credential-encryption.ts.
--     Nothing here clears it, sealed or not.
--   * What it clears: the redundant plaintext copies left in the archived
--     legacy tables (archive.oauth_accounts, calendar_connections,
--     youtube_accounts, lms_connectors, ats_connections). It clears a column
--     only when the matching provider_connections row (same id; 0600 carried
--     ids over) already holds an encrypted value for that secret, meaning it
--     is non-null and has no `legacy:` prefix.
--
-- Anything not yet sealed keeps its archived plaintext copy, so running this
-- early only does less. Best approved after
-- `node --import tsx scripts/backfill-credential-encryption.ts` reports 0
-- remaining legacy secrets. Re-sealed later? Add a new migration with the same
-- statements (this file runs once).
--
-- Column mapping (0600): access_token -> access_token_enc,
-- refresh_token -> refresh_token_enc; ATS api_key -> access_token_enc,
-- ATS webhook_secret -> extra_secret_enc.

DO $mig$
DECLARE
  m record;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('oauth_accounts',       'access_token',   'access_token_enc'),
      ('oauth_accounts',       'refresh_token',  'refresh_token_enc'),
      ('calendar_connections', 'access_token',   'access_token_enc'),
      ('calendar_connections', 'refresh_token',  'refresh_token_enc'),
      ('youtube_accounts',     'access_token',   'access_token_enc'),
      ('youtube_accounts',     'refresh_token',  'refresh_token_enc'),
      ('lms_connectors',       'access_token',   'access_token_enc'),
      ('lms_connectors',       'refresh_token',  'refresh_token_enc'),
      ('ats_connections',      'api_key',        'access_token_enc'),
      ('ats_connections',      'webhook_secret', 'extra_secret_enc')
    ) AS t (src_table, src_column, sealed_column)
  LOOP
    -- Skip a table or column that is not there in this database.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'archive'
         AND table_name = m.src_table
         AND column_name = m.src_column
    );
    EXECUTE format(
      'UPDATE archive.%1$I AS a SET %2$I = NULL
         FROM public.provider_connections pc
        WHERE pc.id = a.id
          AND a.%2$I IS NOT NULL
          AND pc.%3$I IS NOT NULL
          AND pc.%3$I NOT LIKE %4$L',
      m.src_table, m.src_column, m.sealed_column, 'legacy:%'
    );
  END LOOP;
END $mig$;
