-- @owner-gated
-- 0595_archive_wallet_auth_settings_tables.sql
--
-- W3-B (architecture remediation 2026-10-17), step 2 of 0590 / 0591 / 0592.
--
-- Approve (add this filename to SQL_MIGRATIONS_APPROVED) ONLY after the
-- deploy that ran 0590–0592 has finished `wrangler deploy` — i.e. no Worker
-- still reads or writes the old tables — and
--   node --import tsx scripts/verify-wallet-merge.ts
-- reports every source as MATCH (or only drift this migration catches up).
--
-- 1. Catch-up: migrations run BEFORE the new Worker goes live, so the old
--    Worker kept writing the old tables for a minute or two after 0590–0592
--    copied them. Each statement below carries those writes over and is
--    atomic + re-runnable:
--      • balances  — add (old now − old at copy time) using the 0590
--                    snapshot, then advance the snapshot in the SAME
--                    statement (a re-run finds no difference). State columns
--                    (suspension, rate, period, auto top-up) take the old
--                    value only when the old Worker changed them.
--      • ledgers / auth tokens — insert rows not yet copied (ids kept, ON
--                    CONFLICT DO NOTHING); tokens consumed in the window are
--                    marked used.
--      • settings  — copy a section only when the old row is newer than the
--                    section's saved marker.
-- 2. Archive: every retired table moves to the `archive` schema with its
--    rows, indexes and constraints (never DROP). Restore with
--      ALTER TABLE archive.<t> SET SCHEMA public;
--    One-time auth tokens already expired for a day are pruned first —
--    exactly what the retention sweep did to those tables every day — so the
--    archive holds no stale credentials; every row is in auth_tokens anyway.
--
-- The archived tables are registered for GDPR erasure in
-- api/src/services/privacy/archive-pii-registry.ts.

-- ── 1a. Balance catch-up ───────────────────────────────────────────────────
-- `p_select` yields the same columns, in the same order, as 0590's.
CREATE OR REPLACE FUNCTION public.__mig_0595_catch_up_wallet(
  p_source text, p_owner_kind text, p_currency text, p_select text, p_where text
) RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF to_regclass('public.' || p_source) IS NULL THEN RETURN; END IF;
  EXECUTE format($q$
    WITH src AS (
      SELECT %s FROM public.%I WHERE %s
    ),
    cur AS (
      SELECT src.*,
             jsonb_build_object(
               'is_suspended', src.is_suspended, 'suspended_at', src.suspended_at,
               'suspended_reason', src.suspended_reason, 'suspended_by', src.suspended_by,
               'rate_cents_per_1k_points', src.rate_cents_per_1k_points, 'last_period_id', src.last_period_id,
               'auto_top_up_enabled', src.auto_top_up_enabled, 'auto_top_up_threshold', src.auto_top_up_threshold,
               'auto_top_up_amount', src.auto_top_up_amount) AS state,
             COALESCE(s.balance, 0) AS s_balance,
             COALESCE(s.lifetime_granted, 0) AS s_granted,
             COALESCE(s.lifetime_consumed, 0) AS s_consumed,
             COALESCE(s.lifetime_reversed, 0) AS s_reversed,
             s.state AS s_state
      FROM src
      LEFT JOIN archive.wallet_backfill_0590 s ON s.source_table = %L AND s.owner_id = src.owner_id
    ),
    changed AS (
      SELECT cur.*, (cur.s_state IS NULL OR cur.state IS DISTINCT FROM cur.s_state) AS state_changed
      FROM cur
      WHERE cur.s_state IS NULL
         OR (cur.balance, cur.lifetime_granted, cur.lifetime_consumed, cur.lifetime_reversed)
            IS DISTINCT FROM (cur.s_balance, cur.s_granted, cur.s_consumed, cur.s_reversed)
         OR cur.state IS DISTINCT FROM cur.s_state
    ),
    -- Deltas to add, plus the state columns to keep: the old Worker's
    -- value when it changed them since the copy, else the wallet's own.
    to_apply AS (
      SELECT c.owner_id,
             (c.balance - c.s_balance)::int AS d_balance,
             (c.lifetime_granted - c.s_granted)::int AS d_granted,
             (c.lifetime_consumed - c.s_consumed)::int AS d_consumed,
             (c.lifetime_reversed - c.s_reversed)::int AS d_reversed,
             CASE WHEN c.state_changed OR w.id IS NULL THEN c.is_suspended ELSE w.is_suspended END AS is_suspended,
             CASE WHEN c.state_changed OR w.id IS NULL THEN c.suspended_at ELSE w.suspended_at END AS suspended_at,
             CASE WHEN c.state_changed OR w.id IS NULL THEN c.suspended_reason ELSE w.suspended_reason END AS suspended_reason,
             CASE WHEN c.state_changed OR w.id IS NULL THEN c.suspended_by ELSE w.suspended_by END AS suspended_by,
             CASE WHEN c.state_changed OR w.id IS NULL THEN c.rate_cents_per_1k_points ELSE w.rate_cents_per_1k_points END AS rate_cents_per_1k_points,
             CASE WHEN c.state_changed OR w.id IS NULL THEN c.last_period_id ELSE w.last_period_id END AS last_period_id,
             CASE WHEN c.state_changed OR w.id IS NULL THEN c.auto_top_up_enabled ELSE w.auto_top_up_enabled END AS auto_top_up_enabled,
             CASE WHEN c.state_changed OR w.id IS NULL THEN c.auto_top_up_threshold ELSE w.auto_top_up_threshold END AS auto_top_up_threshold,
             CASE WHEN c.state_changed OR w.id IS NULL THEN c.auto_top_up_amount ELSE w.auto_top_up_amount END AS auto_top_up_amount
      FROM changed c
      LEFT JOIN public.wallet_balances w
        ON w.owner_kind = %L AND w.owner_id = c.owner_id AND w.currency_kind = %L
    ),
    applied AS (
      INSERT INTO public.wallet_balances
        (owner_kind, owner_id, currency_kind, balance, lifetime_granted, lifetime_consumed, lifetime_reversed,
         is_suspended, suspended_at, suspended_reason, suspended_by, rate_cents_per_1k_points, last_period_id,
         auto_top_up_enabled, auto_top_up_threshold, auto_top_up_amount)
      SELECT %L, owner_id, %L, d_balance, d_granted, d_consumed, d_reversed,
             is_suspended, suspended_at, suspended_reason, suspended_by, rate_cents_per_1k_points, last_period_id,
             auto_top_up_enabled, auto_top_up_threshold, auto_top_up_amount
      FROM to_apply
      ON CONFLICT (owner_kind, owner_id, currency_kind) DO UPDATE SET
        balance = wallet_balances.balance + EXCLUDED.balance,
        lifetime_granted = wallet_balances.lifetime_granted + EXCLUDED.lifetime_granted,
        lifetime_consumed = wallet_balances.lifetime_consumed + EXCLUDED.lifetime_consumed,
        lifetime_reversed = wallet_balances.lifetime_reversed + EXCLUDED.lifetime_reversed,
        is_suspended = EXCLUDED.is_suspended,
        suspended_at = EXCLUDED.suspended_at,
        suspended_reason = EXCLUDED.suspended_reason,
        suspended_by = EXCLUDED.suspended_by,
        rate_cents_per_1k_points = EXCLUDED.rate_cents_per_1k_points,
        last_period_id = EXCLUDED.last_period_id,
        auto_top_up_enabled = EXCLUDED.auto_top_up_enabled,
        auto_top_up_threshold = EXCLUDED.auto_top_up_threshold,
        auto_top_up_amount = EXCLUDED.auto_top_up_amount,
        updated_at = now()
      RETURNING 1
    )
    INSERT INTO archive.wallet_backfill_0590
      (source_table, owner_id, balance, lifetime_granted, lifetime_consumed, lifetime_reversed, state, taken_at)
    SELECT %L, owner_id, balance, lifetime_granted, lifetime_consumed, lifetime_reversed, state, now()
    FROM changed
    ON CONFLICT (source_table, owner_id) DO UPDATE SET
      balance = EXCLUDED.balance,
      lifetime_granted = EXCLUDED.lifetime_granted,
      lifetime_consumed = EXCLUDED.lifetime_consumed,
      lifetime_reversed = EXCLUDED.lifetime_reversed,
      state = EXCLUDED.state,
      taken_at = EXCLUDED.taken_at
  $q$, p_select, p_source, p_where, p_source, p_owner_kind, p_currency, p_owner_kind, p_currency, p_source);
END;
$fn$;

SELECT public.__mig_0595_catch_up_wallet('user_token_balance', 'user', 'ai_tokens',
  'id, user_id AS owner_id, balance, lifetime_granted, lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   NULL::integer AS rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'TRUE');

SELECT public.__mig_0595_catch_up_wallet('company_token_balance', 'company', 'ai_tokens',
  'id, company_id AS owner_id, balance, lifetime_granted, lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   NULL::integer AS rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'TRUE');

SELECT public.__mig_0595_catch_up_wallet('enrichment_credits', 'user', 'enrichment_credits',
  'id, user_id AS owner_id, balance, total_purchased AS lifetime_granted, total_consumed AS lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   NULL::integer AS rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'TRUE');

SELECT public.__mig_0595_catch_up_wallet('campaign_dollars_balance', 'user', 'campaign_dollars',
  'id, user_id AS owner_id, balance_cents AS balance, lifetime_granted_cents AS lifetime_granted,
   lifetime_spent_cents AS lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   created_at, updated_at',
  'TRUE');

SELECT public.__mig_0595_catch_up_wallet('partner_program_balances', 'user', 'partner_pool',
  'gen_random_uuid() AS id, user_id AS owner_id, pending_cents AS balance, pending_cents + paid_cents AS lifetime_granted,
   paid_cents AS lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   NULL::integer AS rate_cents_per_1k_points, last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'TRUE');

SELECT public.__mig_0595_catch_up_wallet('user_points_balance', 'user', 'points',
  'id, user_id AS owner_id, balance, lifetime_earned AS lifetime_granted, lifetime_redeemed AS lifetime_consumed, lifetime_reversed,
   is_suspended, suspended_at, suspended_reason, suspended_by,
   NULL::integer AS rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   NULL::boolean AS auto_top_up_enabled, NULL::integer AS auto_top_up_threshold, NULL::integer AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'TRUE');

SELECT public.__mig_0595_catch_up_wallet('phone_balances', 'user', 'phone_cents',
  'id, user_id::uuid AS owner_id, balance_cents AS balance, 0 AS lifetime_granted, 0 AS lifetime_consumed, 0 AS lifetime_reversed,
   false AS is_suspended, NULL::timestamptz AS suspended_at, NULL::text AS suspended_reason, NULL::uuid AS suspended_by,
   NULL::integer AS rate_cents_per_1k_points, NULL::uuid AS last_period_id,
   auto_top_up_enabled, auto_top_up_threshold_cents AS auto_top_up_threshold, auto_top_up_amount_cents AS auto_top_up_amount,
   updated_at AS created_at, updated_at',
  'user_id::text ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''');

DROP FUNCTION IF EXISTS public.__mig_0595_catch_up_wallet(text, text, text, text, text);

-- ── 1b. Ledger catch-up (same column mapping as 0590) ──────────────────────
CREATE OR REPLACE FUNCTION public.__mig_0595_catch_up_ledger(
  p_source text, p_currency text, p_select text, p_where text
) RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF to_regclass('public.' || p_source) IS NULL THEN RETURN; END IF;
  EXECUTE format($q$
    INSERT INTO public.wallet_ledger
      (id, owner_kind, owner_id, currency_kind, type, amount, balance_after, reference_type, reference_id,
       description, action, source, reverses_id, metadata, created_at)
    SELECT id, 'user', owner_id, %L, type, amount, balance_after, reference_type, reference_id,
       description, action, source, reverses_id, metadata, created_at
    FROM (SELECT %s FROM public.%I WHERE %s) AS src
    ON CONFLICT DO NOTHING
  $q$, p_currency, p_select, p_source, p_where);
END;
$fn$;

SELECT public.__mig_0595_catch_up_ledger('enrichment_transactions', 'enrichment_credits',
  'id, user_id AS owner_id, type::varchar AS type, amount, balance_after, NULL::varchar AS reference_type, reference_id,
   description, NULL::varchar AS action, NULL::varchar AS source, NULL::uuid AS reverses_id, NULL::jsonb AS metadata, created_at',
  'TRUE');

SELECT public.__mig_0595_catch_up_ledger('campaign_dollars_transactions', 'campaign_dollars',
  'id, user_id AS owner_id, kind::varchar AS type, amount_cents AS amount, balance_after_cents AS balance_after,
   reference_type, reference_id, description, NULL::varchar AS action, NULL::varchar AS source,
   NULL::uuid AS reverses_id, NULL::jsonb AS metadata, created_at',
  'TRUE');

SELECT public.__mig_0595_catch_up_ledger('phone_balance_transactions', 'phone_cents',
  'id, user_id::text::uuid AS owner_id, type::text::varchar AS type, amount_cents AS amount, balance_cents_after AS balance_after,
   NULL::varchar AS reference_type, reference_id, description, NULL::varchar AS action, NULL::varchar AS source,
   NULL::uuid AS reverses_id, NULL::jsonb AS metadata, created_at',
  'user_id::text ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''');

SELECT public.__mig_0595_catch_up_ledger('points_ledger', 'points',
  'id, user_id AS owner_id, category::varchar AS type, delta AS amount, NULL::integer AS balance_after,
   ref_type AS reference_type, ref_id AS reference_id, NULL::text AS description,
   action, source, reverses_id, metadata, created_at',
  'TRUE');

DROP FUNCTION IF EXISTS public.__mig_0595_catch_up_ledger(text, text, text, text);

-- ── 1c. Auth token catch-up ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.__mig_0595_catch_up_tokens(p_source text, p_purpose text, p_select text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF to_regclass('public.' || p_source) IS NULL THEN RETURN; END IF;
  EXECUTE format($q$
    WITH src AS (SELECT %s FROM public.%I),
    ins AS (
      INSERT INTO public.auth_tokens (id, purpose, user_id, email, token, expires_at, used_at, attempts, redirect, created_at)
      SELECT id, %L, user_id, email, token, expires_at, used_at, attempts, redirect, created_at FROM src
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    UPDATE public.auth_tokens a
    SET used_at = COALESCE(a.used_at, src.used_at, now()),
        attempts = GREATEST(a.attempts, src.attempts)
    FROM src
    WHERE a.id = src.id
      AND ((src.used_at IS NOT NULL AND a.used_at IS NULL) OR src.attempts > a.attempts)
  $q$, p_select, p_source, p_purpose);
END;
$fn$;

SELECT public.__mig_0595_catch_up_tokens('email_verification_tokens', 'email_verification',
  'id, user_id, NULL::varchar AS email, token, expires_at,
   CASE WHEN used THEN created_at END AS used_at, 0 AS attempts, NULL::varchar AS redirect, created_at');

SELECT public.__mig_0595_catch_up_tokens('password_reset_tokens', 'password_reset',
  'id, user_id, NULL::varchar AS email, token, expires_at,
   CASE WHEN used THEN created_at END AS used_at, 0 AS attempts, NULL::varchar AS redirect, created_at');

SELECT public.__mig_0595_catch_up_tokens('magic_link_tokens', 'magic_link',
  'id, NULL::uuid AS user_id, email, token, expires_at,
   CASE WHEN used THEN created_at END AS used_at, 0 AS attempts, redirect, created_at');

SELECT public.__mig_0595_catch_up_tokens('two_factor_codes', 'two_factor',
  'id, user_id, NULL::varchar AS email, code AS token, expires_at,
   CASE WHEN used THEN created_at END AS used_at, COALESCE(attempts, 0) AS attempts, NULL::varchar AS redirect, created_at');

DROP FUNCTION IF EXISTS public.__mig_0595_catch_up_tokens(text, text, text);

-- ── 1d. Settings catch-up (a section only when the old row is newer) ──────
-- Each copy runs only while its old table is still in public (a re-run after
-- a partial archive skips the tables already moved).

DO $$
BEGIN
  IF to_regclass('public.account_preferences') IS NULL THEN RETURN; END IF;
  EXECUTE $q$
    INSERT INTO user_settings (
      user_id, email_notifications_enabled, job_alert_emails_enabled, weekly_digest_enabled, notification_preferences,
      theme, language, timezone, currency, extension_settings, account_saved_at, created_at, updated_at
    )
    SELECT ap.user_id, ap.email_notifications_enabled, ap.job_alert_emails_enabled, ap.weekly_digest_enabled,
           ap.notification_preferences, ap.theme, ap.language, ap.timezone, ap.currency, ap.extension_settings,
           ap.updated_at, ap.created_at, ap.updated_at
    FROM account_preferences ap
    LEFT JOIN user_settings us ON us.user_id = ap.user_id
    WHERE us.id IS NULL OR us.account_saved_at IS NULL OR ap.updated_at > us.account_saved_at
    ON CONFLICT (user_id) DO UPDATE SET
      email_notifications_enabled = EXCLUDED.email_notifications_enabled,
      job_alert_emails_enabled = EXCLUDED.job_alert_emails_enabled,
      weekly_digest_enabled = EXCLUDED.weekly_digest_enabled,
      notification_preferences = EXCLUDED.notification_preferences,
      theme = EXCLUDED.theme,
      language = EXCLUDED.language,
      timezone = EXCLUDED.timezone,
      currency = EXCLUDED.currency,
      extension_settings = EXCLUDED.extension_settings,
      account_saved_at = EXCLUDED.account_saved_at,
      updated_at = GREATEST(user_settings.updated_at, EXCLUDED.updated_at)
  $q$;
END $$;

DO $$
BEGIN
  IF to_regclass('public.privacy_preferences') IS NULL THEN RETURN; END IF;
  EXECUTE $q$
    INSERT INTO user_settings (
      user_id, profile_visible_to_public, profile_visible_to_recruiters, allow_search_engine_indexing, show_activity_status,
      show_connections_list, allow_direct_messages, allow_connection_requests, show_email, show_phone, show_location,
      promote_without_auth, allow_messaging, share_analytics_data, share_usage_data, allow_data_export,
      privacy_saved_at, created_at, updated_at
    )
    SELECT pp.user_id, pp.profile_visible_to_public, pp.profile_visible_to_recruiters, pp.allow_search_engine_indexing,
           pp.show_activity_status, pp.show_connections_list, pp.allow_direct_messages, pp.allow_connection_requests,
           pp.show_email, pp.show_phone, pp.show_location, pp.promote_without_auth, pp.allow_messaging,
           pp.share_analytics_data, pp.share_usage_data, pp.allow_data_export,
           pp.updated_at, pp.created_at, pp.updated_at
    FROM privacy_preferences pp
    LEFT JOIN user_settings us ON us.user_id = pp.user_id
    WHERE us.id IS NULL OR us.privacy_saved_at IS NULL OR pp.updated_at > us.privacy_saved_at
    ON CONFLICT (user_id) DO UPDATE SET
      profile_visible_to_public = EXCLUDED.profile_visible_to_public,
      profile_visible_to_recruiters = EXCLUDED.profile_visible_to_recruiters,
      allow_search_engine_indexing = EXCLUDED.allow_search_engine_indexing,
      show_activity_status = EXCLUDED.show_activity_status,
      show_connections_list = EXCLUDED.show_connections_list,
      allow_direct_messages = EXCLUDED.allow_direct_messages,
      allow_connection_requests = EXCLUDED.allow_connection_requests,
      show_email = EXCLUDED.show_email,
      show_phone = EXCLUDED.show_phone,
      show_location = EXCLUDED.show_location,
      promote_without_auth = EXCLUDED.promote_without_auth,
      allow_messaging = EXCLUDED.allow_messaging,
      share_analytics_data = EXCLUDED.share_analytics_data,
      share_usage_data = EXCLUDED.share_usage_data,
      allow_data_export = EXCLUDED.allow_data_export,
      privacy_saved_at = EXCLUDED.privacy_saved_at,
      updated_at = GREATEST(user_settings.updated_at, EXCLUDED.updated_at)
  $q$;
END $$;

DO $$
BEGIN
  IF to_regclass('public.cookie_preferences') IS NULL THEN RETURN; END IF;
  EXECUTE $q$
    INSERT INTO user_settings (
      user_id, cookie_analytics, cookie_marketing, cookie_personalization, cookie_consented_at, cookies_saved_at,
      created_at, updated_at
    )
    SELECT cp.user_id, cp.analytics, cp.marketing, cp.personalization, cp.consented_at, cp.updated_at,
           cp.created_at, cp.updated_at
    FROM cookie_preferences cp
    LEFT JOIN user_settings us ON us.user_id = cp.user_id
    WHERE us.id IS NULL OR us.cookies_saved_at IS NULL OR cp.updated_at > us.cookies_saved_at
    ON CONFLICT (user_id) DO UPDATE SET
      cookie_analytics = EXCLUDED.cookie_analytics,
      cookie_marketing = EXCLUDED.cookie_marketing,
      cookie_personalization = EXCLUDED.cookie_personalization,
      cookie_consented_at = EXCLUDED.cookie_consented_at,
      cookies_saved_at = EXCLUDED.cookies_saved_at,
      updated_at = GREATEST(user_settings.updated_at, EXCLUDED.updated_at)
  $q$;
END $$;

-- ── 2. Archive ──────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS archive;

-- Stale one-time credentials: the retention sweep deleted these daily.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['two_factor_codes', 'magic_link_tokens', 'email_verification_tokens', 'password_reset_tokens'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE expires_at < now() - interval ''1 day''', t);
    END IF;
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.user_token_balance SET SCHEMA archive;
ALTER TABLE IF EXISTS public.company_token_balance SET SCHEMA archive;
ALTER TABLE IF EXISTS public.enrichment_credits SET SCHEMA archive;
ALTER TABLE IF EXISTS public.enrichment_transactions SET SCHEMA archive;
ALTER TABLE IF EXISTS public.campaign_dollars_balance SET SCHEMA archive;
ALTER TABLE IF EXISTS public.campaign_dollars_transactions SET SCHEMA archive;
ALTER TABLE IF EXISTS public.partner_program_balances SET SCHEMA archive;
ALTER TABLE IF EXISTS public.user_points_balance SET SCHEMA archive;
ALTER TABLE IF EXISTS public.points_ledger SET SCHEMA archive;
ALTER TABLE IF EXISTS public.phone_balances SET SCHEMA archive;
ALTER TABLE IF EXISTS public.phone_balance_transactions SET SCHEMA archive;
ALTER TABLE IF EXISTS public.two_factor_codes SET SCHEMA archive;
ALTER TABLE IF EXISTS public.email_verification_tokens SET SCHEMA archive;
ALTER TABLE IF EXISTS public.password_reset_tokens SET SCHEMA archive;
ALTER TABLE IF EXISTS public.magic_link_tokens SET SCHEMA archive;
ALTER TABLE IF EXISTS public.account_preferences SET SCHEMA archive;
ALTER TABLE IF EXISTS public.privacy_preferences SET SCHEMA archive;
ALTER TABLE IF EXISTS public.cookie_preferences SET SCHEMA archive;
