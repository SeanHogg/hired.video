-- 0600_provider_connections.sql
--
-- W3-C provider connections (architecture remediation 2026-10-17, gap #2410-#2417).
--
-- ONE `provider_connections` table with ONE encryption scheme replaces eleven
-- per-feature credential tables:
--
--   oauth_accounts          -> purpose 'login'           owner user
--   calendar_connections    -> purpose 'calendar'        owner user
--   youtube_accounts        -> purpose 'youtube'         owner user (provider 'google')
--   lms_connectors          -> purpose 'lms'             owner user | workspace
--   ats_connections         -> purpose 'ats'             owner company
--   company_integrations    -> purpose 'workforce'       owner company
--   tenant_integrations     -> purpose 'api_key'         owner user | workspace
--   paid_media_connections  -> purpose 'ads'             owner user | workspace
--   social_connections      -> purpose 'social_publish'  owner user | workspace
--   managed_accounts        -> purpose 'managed_social'  owner platform
--   external_email_accounts -> purpose 'email_inbox'     owner user
--
-- Vocabularies: shared/provider-connections.ts. Schema:
-- api/src/db/schema/providerConnections.ts.
--
-- Row ids are carried over, so scheduled_events.calendar_connection_id,
-- lms_course_publishes.connector_id, external_email_messages.account_id,
-- email_sync_runs.account_id and paid_media_accounts.connection_id keep
-- resolving; their FKs are repointed here.
--
-- Status: one vocabulary (active | expired | revoked | error). connected ->
-- active, disconnected / is_active=false soft-delete -> revoked. A user
-- toggle (inbox 'paused', calendar sync_enabled, ats/tenant is_active) is the
-- `enabled` column, not a status.
--
-- Secrets. Migration SQL has no key, so it cannot re-encrypt. Values are
-- copied as stored:
--   * *_enc written by services/crypto/credential-columns.ts (ats, calendar,
--     lms, oauth, youtube) are already the canonical scheme -> copied as is;
--   * every other store's ciphertext is copied behind a `legacy:<scheme>:`
--     prefix (paid_media, social, email, workforce; tenant_integrations'
--     bytea ciphertext+nonce as `legacy:payout:<b64 nonce>:<b64 ct>:<key id>`);
--   * a plaintext column (rows never backfilled by 0548/0577's script) is
--     copied as `legacy:plain:<value>`.
-- services/provider-connections/connection-secrets.ts decrypts every legacy
-- scheme with that store's old key and re-seals the value under
-- CREDENTIALS_KMS_KEY on first read (lazy re-seal);
-- scripts/backfill-credential-encryption.ts re-seals every remaining row
-- eagerly. 0602 (owner-gated) then clears any plaintext still left.
--
-- Duplicates: four sources had no natural unique key (calendar, youtube, lms,
-- ats). Within a source the newest active row keeps its external_account_id;
-- any other row with the same identity gets `#dup:<id>` appended so it still
-- copies (nothing is dropped, ids stay valid).
--
-- Idempotent: CREATE … IF NOT EXISTS, guarded constraints, ON CONFLICT DO
-- NOTHING on the carried id, sources skipped once archived (0601).

CREATE TABLE IF NOT EXISTS public.provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_kind varchar(16) NOT NULL,
  owner_id uuid,
  user_id uuid CONSTRAINT provider_connections_user_id_users_id_fk REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid,
  connected_by_user_id uuid CONSTRAINT provider_connections_connected_by_user_id_users_id_fk REFERENCES public.users(id) ON DELETE SET NULL,
  provider varchar(64) NOT NULL,
  purpose varchar(24) NOT NULL,
  external_account_id text,
  handle text,
  display_name text,
  avatar_url text,
  access_token_enc text,
  refresh_token_enc text,
  extra_secret_enc text,
  scopes text,
  status varchar(16) NOT NULL DEFAULT 'active',
  enabled boolean NOT NULL DEFAULT true,
  last_error text,
  last_sync_at timestamptz,
  expires_at timestamptz,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  min_relevance_score numeric(4, 3),
  active_profile_id uuid CONSTRAINT provider_connections_active_profile_id_inbox_profiles_id_fk REFERENCES public.inbox_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_connections_owner_kind_check
    CHECK (owner_kind IN ('user', 'company', 'workspace', 'platform')),
  CONSTRAINT provider_connections_purpose_check
    CHECK (purpose IN ('login', 'calendar', 'ats', 'lms', 'ads', 'social_publish', 'managed_social', 'email_inbox', 'youtube', 'workforce', 'api_key')),
  CONSTRAINT provider_connections_status_check
    CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  CONSTRAINT provider_connections_owner_check
    CHECK ((owner_kind = 'platform') = (owner_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_connections_identity
  ON public.provider_connections (provider, purpose, owner_kind, owner_id, user_id, external_account_id) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_connections_login
  ON public.provider_connections (provider, external_account_id) WHERE purpose = 'login';
CREATE INDEX IF NOT EXISTS idx_provider_connections_user_purpose
  ON public.provider_connections (user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_provider_connections_owner_purpose
  ON public.provider_connections (owner_kind, owner_id, purpose);
CREATE INDEX IF NOT EXISTS idx_provider_connections_purpose_provider
  ON public.provider_connections (purpose, provider);
CREATE INDEX IF NOT EXISTS idx_provider_connections_connected_by_user_id
  ON public.provider_connections (connected_by_user_id);
CREATE INDEX IF NOT EXISTS idx_provider_connections_active_profile_id
  ON public.provider_connections (active_profile_id);

-- drizzle-kit push creates the identity index (it runs before this file)
-- without NULLS NOT DISTINCT, which would let two rows with a NULL owner /
-- user / external id collide silently. Upgrade it in place (0532 pattern).
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'uq_provider_connections_identity' AND NOT i.indnullsnotdistinct
  ) THEN
    DROP INDEX public.uq_provider_connections_identity;
    CREATE UNIQUE INDEX uq_provider_connections_identity
      ON public.provider_connections (provider, purpose, owner_kind, owner_id, user_id, external_account_id) NULLS NOT DISTINCT;
  END IF;
END $mig$;

-- ── Backfill helpers (dropped at the end of this file) ───────────────────────

-- A stored secret: canonical ciphertext as is, any other store's value behind
-- `legacy:<scheme>:`, a plaintext column behind `legacy:plain:`.
CREATE OR REPLACE FUNCTION public.__mig_0600_secret(enc text, plain text, scheme text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT CASE
    WHEN enc IS NOT NULL AND enc <> '' THEN
      CASE WHEN scheme = 'credentials' THEN enc ELSE 'legacy:' || scheme || ':' || enc END
    WHEN plain IS NOT NULL AND plain <> '' THEN 'legacy:plain:' || plain
  END
$f$;

-- One status vocabulary.
CREATE OR REPLACE FUNCTION public.__mig_0600_status(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT CASE
    WHEN s IN ('active', 'expired', 'revoked', 'error') THEN s
    WHEN s IN ('connected', 'paused') THEN 'active'
    WHEN s = 'disconnected' THEN 'revoked'
    ELSE 'error'
  END
$f$;

-- A jsonb scope array as a space-separated list.
CREATE OR REPLACE FUNCTION public.__mig_0600_scopes(j jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT CASE
    WHEN j IS NULL THEN NULL
    WHEN jsonb_typeof(j) = 'array' THEN (SELECT string_agg(x, ' ') FROM jsonb_array_elements_text(j) AS x)
    WHEN jsonb_typeof(j) = 'string' THEN j #>> '{}'
  END
$f$;

-- Insert one source's rows (a SELECT producing every provider_connections
-- column, positionally, in the order of the alias list below), keeping the newest active row's identity
-- and suffixing the external id of any duplicate.
CREATE OR REPLACE FUNCTION public.__mig_0600_copy(source_table text, source_select text)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  IF to_regclass('public.' || source_table) IS NULL THEN
    RETURN;
  END IF;
  EXECUTE format($q$
    INSERT INTO public.provider_connections (
      id, owner_kind, owner_id, user_id, company_id, connected_by_user_id,
      provider, purpose, external_account_id, handle, display_name, avatar_url,
      access_token_enc, refresh_token_enc, extra_secret_enc, scopes, status,
      enabled, last_error, last_sync_at, expires_at, config,
      min_relevance_score, active_profile_id, created_at, updated_at
    )
    SELECT
      d.id, d.owner_kind, d.owner_id, d.user_id, d.company_id, d.connected_by_user_id,
      d.provider, d.purpose,
      CASE WHEN d.rn = 1 THEN d.external_account_id
           ELSE COALESCE(d.external_account_id, '') || '#dup:' || d.id::text END,
      d.handle, d.display_name, d.avatar_url,
      d.access_token_enc, d.refresh_token_enc, d.extra_secret_enc, d.scopes, d.status,
      d.enabled, d.last_error, d.last_sync_at, d.expires_at, d.config,
      d.min_relevance_score, d.active_profile_id, d.created_at, d.updated_at
    FROM (
      SELECT s.*, row_number() OVER (
        PARTITION BY s.provider, s.purpose, s.owner_kind, s.owner_id, s.user_id, s.external_account_id
        ORDER BY (s.status = 'active') DESC, s.updated_at DESC, s.id
      ) AS rn
      FROM (%s) AS s (
        id, owner_kind, owner_id, user_id, company_id, connected_by_user_id,
        provider, purpose, external_account_id, handle, display_name, avatar_url,
        access_token_enc, refresh_token_enc, extra_secret_enc, scopes, status,
        enabled, last_error, last_sync_at, expires_at, config,
        min_relevance_score, active_profile_id, created_at, updated_at
      )
    ) AS d
    ON CONFLICT DO NOTHING
  $q$, source_select);
END;
$f$;

-- ── Backfill, one source at a time ──────────────────────────────────────────

SELECT public.__mig_0600_copy('oauth_accounts', $s$
  SELECT o.id, 'user'::varchar AS owner_kind, o.user_id AS owner_id, o.user_id, NULL::uuid AS company_id,
         NULL::uuid AS connected_by_user_id, o.provider::varchar AS provider, 'login'::varchar AS purpose,
         o.provider_account_id::text AS external_account_id, o.email::text AS handle,
         o.display_name::text AS display_name, o.avatar_url AS avatar_url,
         public.__mig_0600_secret(o.access_token_enc, o.access_token, 'credentials') AS access_token_enc,
         public.__mig_0600_secret(o.refresh_token_enc, o.refresh_token, 'credentials') AS refresh_token_enc,
         NULL::text AS extra_secret_enc, o.scope AS scopes, 'active'::varchar AS status, true AS enabled,
         NULL::text AS last_error, NULL::timestamptz AS last_sync_at, o.token_expires_at AS expires_at,
         '{}'::jsonb AS config, NULL::numeric AS min_relevance_score, NULL::uuid AS active_profile_id,
         o.created_at, o.updated_at
  FROM public.oauth_accounts o
$s$);

SELECT public.__mig_0600_copy('calendar_connections', $s$
  SELECT c.id, 'user'::varchar, c.user_id, c.user_id, NULL::uuid, NULL::uuid,
         c.provider::varchar, 'calendar'::varchar,
         c.provider_account_id, c.calendar_name::text, NULL::text, NULL::text,
         public.__mig_0600_secret(c.access_token_enc, c.access_token, 'credentials'),
         public.__mig_0600_secret(c.refresh_token_enc, c.refresh_token, 'credentials'),
         NULL::text, c.scopes, CASE WHEN c.is_active THEN 'active' ELSE 'revoked' END::varchar,
         c.sync_enabled, NULL::text, c.last_synced_at, c.token_expires_at,
         jsonb_strip_nulls(jsonb_build_object('calendarId', c.calendar_id)),
         NULL::numeric, NULL::uuid, c.created_at, c.updated_at
  FROM public.calendar_connections c
$s$);

SELECT public.__mig_0600_copy('youtube_accounts', $s$
  SELECT y.id, 'user'::varchar, y.user_id, y.user_id, NULL::uuid, NULL::uuid,
         'google'::varchar, 'youtube'::varchar,
         y.google_id, y.channel_title, y.display_name, NULL::text,
         public.__mig_0600_secret(y.access_token_enc, y.access_token, 'credentials'),
         public.__mig_0600_secret(y.refresh_token_enc, y.refresh_token, 'credentials'),
         NULL::text, y.scopes, CASE WHEN y.is_active THEN 'active' ELSE 'revoked' END::varchar,
         true, NULL::text, NULL::timestamptz, y.token_expires_at,
         jsonb_strip_nulls(jsonb_build_object('channelId', y.channel_id, 'email', y.email)),
         NULL::numeric, NULL::uuid, y.created_at, y.updated_at
  FROM public.youtube_accounts y
$s$);

SELECT public.__mig_0600_copy('lms_connectors', $s$
  SELECT l.id,
         CASE WHEN l.company_id IS NULL THEN 'user' ELSE 'workspace' END::varchar,
         COALESCE(l.company_id, l.user_id), l.user_id, l.company_id, NULL::uuid,
         l.provider::varchar, 'lms'::varchar,
         NULL::text, NULL::text, l.display_name::text, NULL::text,
         public.__mig_0600_secret(l.access_token_enc, l.access_token, 'credentials'),
         public.__mig_0600_secret(l.refresh_token_enc, l.refresh_token, 'credentials'),
         NULL::text, l.scope, public.__mig_0600_status(l.status)::varchar,
         true, l.last_error, l.last_sync_at, l.expires_at,
         jsonb_strip_nulls(jsonb_build_object('baseUrl', l.base_url, 'metadata', l.metadata)),
         NULL::numeric, NULL::uuid, l.created_at, l.updated_at
  FROM public.lms_connectors l
$s$);

SELECT public.__mig_0600_copy('ats_connections', $s$
  SELECT a.id, 'company'::varchar, a.company_id, NULL::uuid, a.company_id, NULL::uuid,
         a.provider::varchar, 'ats'::varchar,
         NULL::text, NULL::text, NULL::text, NULL::text,
         public.__mig_0600_secret(a.api_key_enc, a.api_key, 'credentials'),
         NULL::text,
         public.__mig_0600_secret(a.webhook_secret_enc, a.webhook_secret, 'credentials'),
         NULL::text, 'active'::varchar, a.is_active, NULL::text, a.last_sync_at, NULL::timestamptz,
         COALESCE(a.config, '{}'::jsonb),
         NULL::numeric, NULL::uuid, a.created_at, a.updated_at
  FROM public.ats_connections a
$s$);

SELECT public.__mig_0600_copy('company_integrations', $s$
  SELECT ci.id, 'company'::varchar, ci.company_id, NULL::uuid, ci.company_id, ci.connected_by_user_id,
         ci.provider::varchar, 'workforce'::varchar,
         ci.external_account_id::text, NULL::text, NULL::text, NULL::text,
         public.__mig_0600_secret(ci.access_token_enc, NULL, 'workforce'),
         public.__mig_0600_secret(ci.refresh_token_enc, NULL, 'workforce'),
         NULL::text, public.__mig_0600_scopes(ci.scopes), public.__mig_0600_status(ci.status)::varchar,
         true, ci.last_error, ci.last_sync_at, ci.expires_at,
         CASE WHEN jsonb_typeof(ci.metadata) = 'object' THEN ci.metadata ELSE '{}'::jsonb END,
         NULL::numeric, NULL::uuid, ci.created_at, ci.updated_at
  FROM public.company_integrations ci
$s$);

SELECT public.__mig_0600_copy('tenant_integrations', $s$
  SELECT t.id,
         CASE WHEN t.company_id IS NULL THEN 'user' ELSE 'workspace' END::varchar,
         COALESCE(t.company_id, t.user_id), t.user_id, t.company_id, NULL::uuid,
         t.provider::varchar, 'api_key'::varchar,
         t.slug::text, NULL::text, NULL::text, NULL::text,
         NULL::text, NULL::text,
         'legacy:payout:' || translate(encode(t.credentials_nonce, 'base64'), E'\n', '')
           || ':' || translate(encode(t.credentials_ciphertext, 'base64'), E'\n', '')
           || ':' || t.credentials_kms_key_id,
         NULL::text, 'active'::varchar, t.is_active, NULL::text, NULL::timestamptz, NULL::timestamptz,
         jsonb_strip_nulls(jsonb_build_object('last4', t.credentials_last4)),
         NULL::numeric, NULL::uuid, t.created_at, t.updated_at
  FROM public.tenant_integrations t
$s$);

SELECT public.__mig_0600_copy('paid_media_connections', $s$
  SELECT p.id,
         CASE WHEN p.company_id IS NULL THEN 'user' ELSE 'workspace' END::varchar,
         COALESCE(p.company_id, p.user_id), p.user_id, p.company_id, NULL::uuid,
         p.platform::varchar, 'ads'::varchar,
         p.external_user_id, p.external_user_handle, NULL::text, NULL::text,
         public.__mig_0600_secret(p.access_token_enc, NULL, 'paid_media'),
         public.__mig_0600_secret(p.refresh_token_enc, NULL, 'paid_media'),
         NULL::text, p.scopes, public.__mig_0600_status(p.status)::varchar,
         true, p.last_error, p.last_synced_at, p.access_token_expires_at,
         '{}'::jsonb, NULL::numeric, NULL::uuid, p.created_at, p.updated_at
  FROM public.paid_media_connections p
$s$);

SELECT public.__mig_0600_copy('social_connections', $s$
  SELECT sc.id,
         CASE WHEN sc.company_id IS NULL THEN 'user' ELSE 'workspace' END::varchar,
         COALESCE(sc.company_id, sc.user_id), sc.user_id, sc.company_id, NULL::uuid,
         sc.platform::varchar, 'social_publish'::varchar,
         sc.external_account_id, sc.handle, NULL::text, sc.avatar_url,
         public.__mig_0600_secret(sc.access_token_enc, NULL, 'social'),
         public.__mig_0600_secret(sc.refresh_token_enc, NULL, 'social'),
         NULL::text, sc.scopes, public.__mig_0600_status(sc.status)::varchar,
         true, sc.last_error, NULL::timestamptz, sc.access_token_expires_at,
         '{}'::jsonb, NULL::numeric, NULL::uuid, sc.created_at, sc.updated_at
  FROM public.social_connections sc
  -- social_connections.user_id never had an FK; rows left behind by deleted
  -- users would violate provider_connections_user_id_users_id_fk.
  WHERE sc.user_id IS NULL OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = sc.user_id)
$s$);

SELECT public.__mig_0600_copy('managed_accounts', $s$
  SELECT m.id, 'platform'::varchar, NULL::uuid, NULL::uuid, NULL::uuid, m.connected_by_user_id,
         m.platform::varchar, 'managed_social'::varchar,
         m.external_account_id, m.handle, NULL::text, m.avatar_url,
         public.__mig_0600_secret(m.access_token_enc, NULL, 'social'),
         public.__mig_0600_secret(m.refresh_token_enc, NULL, 'social'),
         NULL::text, m.scopes, public.__mig_0600_status(m.status)::varchar,
         true, m.last_error, NULL::timestamptz, m.access_token_expires_at,
         '{}'::jsonb, NULL::numeric, NULL::uuid, m.created_at, m.updated_at
  FROM public.managed_accounts m
$s$);

SELECT public.__mig_0600_copy('external_email_accounts', $s$
  SELECT e.id, 'user'::varchar, e.user_id, e.user_id, NULL::uuid, NULL::uuid,
         e.provider::varchar, 'email_inbox'::varchar,
         e.account_email::text, e.account_label::text, NULL::text, NULL::text,
         NULL::text,
         public.__mig_0600_secret(e.oauth_refresh_token_enc, NULL, 'email'),
         NULL::text, public.__mig_0600_scopes(e.scopes), public.__mig_0600_status(e.status)::varchar,
         e.status <> 'paused', e.last_error, e.last_synced_at, NULL::timestamptz,
         jsonb_strip_nulls(jsonb_build_object(
           'pushSubscriptionId', e.push_subscription_id,
           'pushExpiresAt', e.push_expires_at,
           'lastHistoryId', e.last_history_id,
           'lastDeltaLink', e.last_delta_link
         )),
         e.min_relevance_score, e.active_profile_id, e.created_at, e.updated_at
  FROM public.external_email_accounts e
$s$);

DROP FUNCTION IF EXISTS public.__mig_0600_copy(text, text);
DROP FUNCTION IF EXISTS public.__mig_0600_scopes(jsonb);
DROP FUNCTION IF EXISTS public.__mig_0600_status(text);
DROP FUNCTION IF EXISTS public.__mig_0600_secret(text, text, text);

-- ── Repoint inbound FKs ─────────────────────────────────────────────────────
-- Drop whatever FK each child column has today (it points at a table archived
-- by 0601), then add the one the schema declares. NOT VALID: every child id
-- was carried over above, and a NOT VALID FK still guards every new write.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, src.relname AS src_table
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = src.relnamespace
    JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    WHERE c.contype = 'f'
      AND ns.nspname = 'public'
      AND tgt.relname <> 'provider_connections'
      AND (src.relname, att.attname) IN (
        ('scheduled_events', 'calendar_connection_id'),
        ('lms_course_publishes', 'connector_id'),
        ('external_email_messages', 'account_id'),
        ('email_sync_runs', 'account_id')
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.src_table, r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_events_calendar_connection_id_fk') THEN
    ALTER TABLE public.scheduled_events
      ADD CONSTRAINT scheduled_events_calendar_connection_id_fk
      FOREIGN KEY (calendar_connection_id) REFERENCES public.provider_connections(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lms_course_publishes_connector_id_provider_connections_id_fk') THEN
    ALTER TABLE public.lms_course_publishes
      ADD CONSTRAINT lms_course_publishes_connector_id_provider_connections_id_fk
      FOREIGN KEY (connector_id) REFERENCES public.provider_connections(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_email_messages_account_id_provider_connections_id_fk') THEN
    ALTER TABLE public.external_email_messages
      ADD CONSTRAINT external_email_messages_account_id_provider_connections_id_fk
      FOREIGN KEY (account_id) REFERENCES public.provider_connections(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_sync_runs_account_id_provider_connections_id_fk') THEN
    ALTER TABLE public.email_sync_runs
      ADD CONSTRAINT email_sync_runs_account_id_provider_connections_id_fk
      FOREIGN KEY (account_id) REFERENCES public.provider_connections(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

-- ── Company deletion ────────────────────────────────────────────────────────
-- ats_connections / company_integrations / tenant_integrations cascaded on
-- company_profiles delete; company_id here is a scope column without an FK
-- (some legacy workspace rows name a company that no longer exists), so a
-- statement-level trigger deletes a removed company's connections instead
-- (0581 pattern).

CREATE OR REPLACE FUNCTION public.provider_connections_company_deleted() RETURNS trigger
LANGUAGE plpgsql
AS $f$
BEGIN
  DELETE FROM public.provider_connections pc
   USING old_rows o
   WHERE pc.company_id = o.id;
  RETURN NULL;
END;
$f$;

DROP TRIGGER IF EXISTS trg_provider_connections_company_deleted ON public.company_profiles;
CREATE TRIGGER trg_provider_connections_company_deleted
  AFTER DELETE ON public.company_profiles
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.provider_connections_company_deleted();

-- ── Guest adoption (0533) moves provider_connections ────────────────────────
-- adopt_guest_user named social_connections + youtube_accounts, which 0601
-- archives. Same behaviour on the merged table: the visitor's fresh
-- connection replaces the account's for the same network (social publishing:
-- one per platform + workspace; everything else: the same external
-- identity), then the guest's rows move with owner_id rewritten for
-- user-owned rows (owner_id carries no FK, so the generic loop below would
-- leave it behind).

CREATE OR REPLACE FUNCTION adopt_guest_user(p_guest uuid, p_target uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  r record;
  rr record;
  n integer;
  moved integer := 0;
BEGIN
  IF p_guest = p_target THEN
    RETURN 0;
  END IF;

  PERFORM 1 FROM users WHERE id = p_guest AND is_guest FOR UPDATE;
  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  -- The guest's sessions die with it (its JWTs stop validating).
  DELETE FROM sessions WHERE user_id = p_guest;

  -- The visitor's fresh connections win over the account's older ones.
  DELETE FROM provider_connections acct
   USING provider_connections g
   WHERE g.user_id = p_guest
     AND acct.user_id = p_target
     AND acct.purpose = g.purpose
     AND acct.provider = g.provider
     AND acct.company_id IS NOT DISTINCT FROM g.company_id
     AND (g.purpose = 'social_publish' OR acct.external_account_id IS NOT DISTINCT FROM g.external_account_id);

  UPDATE provider_connections
     SET user_id = p_target,
         owner_id = CASE WHEN owner_kind = 'user' THEN p_target ELSE owner_id END,
         updated_at = now()
   WHERE user_id = p_guest;
  GET DIAGNOSTICS n = ROW_COUNT;
  moved := moved + n;

  FOR r IN
    SELECT ns.nspname AS sch, cl.relname AS tbl, att.attname AS col
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND con.confrelid = 'public.users'::regclass
       AND array_length(con.conkey, 1) = 1
       AND cl.relname <> 'users'
    UNION
    SELECT c.table_schema, c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND c.column_name = 'user_id'
       AND c.data_type IN ('text', 'character varying')
  LOOP
    BEGIN
      EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I::text = $2', r.sch, r.tbl, r.col, r.col)
        USING p_target, p_guest::text;
      GET DIAGNOSTICS n = ROW_COUNT;
      moved := moved + n;
    EXCEPTION
      WHEN unique_violation OR exclusion_violation OR check_violation THEN
        -- Row by row: only a row that collides is dropped (the real
        -- user's row stays); every other guest row still moves.
        FOR rr IN EXECUTE format('SELECT ctid FROM %I.%I WHERE %I::text = $1', r.sch, r.tbl, r.col)
          USING p_guest::text
        LOOP
          BEGIN
            EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE ctid = $2', r.sch, r.tbl, r.col)
              USING p_target, rr.ctid;
            moved := moved + 1;
          EXCEPTION
            WHEN unique_violation OR exclusion_violation OR check_violation THEN
              EXECUTE format('DELETE FROM %I.%I WHERE ctid = $1', r.sch, r.tbl)
                USING rr.ctid;
          END;
        END LOOP;
    END;
  END LOOP;

  DELETE FROM users WHERE id = p_guest;
  RETURN moved;
END;
$fn$;
