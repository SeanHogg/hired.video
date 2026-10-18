-- 0651_backfill_social_connections_from_archive.sql
--
-- W3-C repair (2026-10-18). In production, 0600's social_connections copy
-- failed on provider_connections_user_id_users_id_fk: some social_connections
-- rows name a user that no longer exists (that column never had an FK). The
-- other ten sources copied, 0601 then archived every source table, so the
-- social publishing connections sit only in archive.social_connections.
--
-- This copies them into provider_connections exactly as 0600 maps them,
-- skipping rows whose user is gone. ids are carried over and the insert is
-- ON CONFLICT DO NOTHING, so it is a no-op wherever 0600 already copied the
-- rows (fresh databases, where the fixed 0600 runs before 0601).

DO $mig$
BEGIN
  IF to_regclass('archive.social_connections') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.provider_connections (
    id, owner_kind, owner_id, user_id, company_id, connected_by_user_id,
    provider, purpose, external_account_id, handle, display_name, avatar_url,
    access_token_enc, refresh_token_enc, extra_secret_enc, scopes, status,
    enabled, last_error, last_sync_at, expires_at, config,
    min_relevance_score, active_profile_id, created_at, updated_at
  )
  SELECT
    d.id, d.owner_kind, d.owner_id, d.user_id, d.company_id, NULL::uuid,
    d.provider, 'social_publish',
    CASE WHEN d.rn = 1 THEN d.external_account_id
         ELSE COALESCE(d.external_account_id, '') || '#dup:' || d.id::text END,
    d.handle, NULL::text, d.avatar_url,
    d.access_token_enc, d.refresh_token_enc, NULL::text, d.scopes, d.status,
    true, d.last_error, NULL::timestamptz, d.expires_at, '{}'::jsonb,
    NULL::numeric, NULL::uuid, d.created_at, d.updated_at
  FROM (
    SELECT s.*, row_number() OVER (
      PARTITION BY s.provider, s.owner_kind, s.owner_id, s.user_id, s.external_account_id
      ORDER BY (s.status = 'active') DESC, s.updated_at DESC, s.id
    ) AS rn
    FROM (
      SELECT
        sc.id,
        (CASE WHEN sc.company_id IS NULL THEN 'user' ELSE 'workspace' END)::varchar AS owner_kind,
        COALESCE(sc.company_id, sc.user_id) AS owner_id,
        sc.user_id,
        sc.company_id,
        sc.platform::varchar AS provider,
        sc.external_account_id,
        sc.handle,
        sc.avatar_url,
        CASE WHEN sc.access_token_enc IS NOT NULL AND sc.access_token_enc <> ''
             THEN 'legacy:social:' || sc.access_token_enc END AS access_token_enc,
        CASE WHEN sc.refresh_token_enc IS NOT NULL AND sc.refresh_token_enc <> ''
             THEN 'legacy:social:' || sc.refresh_token_enc END AS refresh_token_enc,
        sc.scopes,
        (CASE
           WHEN sc.status IN ('active', 'expired', 'revoked', 'error') THEN sc.status
           WHEN sc.status IN ('connected', 'paused') THEN 'active'
           WHEN sc.status = 'disconnected' THEN 'revoked'
           ELSE 'error'
         END)::varchar AS status,
        sc.last_error,
        sc.access_token_expires_at AS expires_at,
        sc.created_at,
        sc.updated_at
      FROM archive.social_connections sc
      WHERE sc.user_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = sc.user_id)
    ) AS s
  ) AS d
  ON CONFLICT DO NOTHING;
END $mig$;
