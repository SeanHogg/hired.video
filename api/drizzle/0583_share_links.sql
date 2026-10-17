-- 0583_share_links.sql
--
-- W3-A engagement merges (architecture remediation 2026-10-17): ONE
-- polymorphic `share_links` table replaces six per-kind share/invite tables:
--
--   candidate_resume_shares → subject_type 'candidate_resume' (subject = candidate_resume_id)
--   pitch_deck_shares       → 'pitch_deck'       (subject = deck_id)
--   pipeline_share_links    → 'pipeline_job'     (subject = job_id)
--   studio_review_links     → 'studio_review'    (subject = project_id)
--   reference_shares        → 'reference_packet' (subject = owner_user_id)
--   game_play_invites       → 'game_play'        (subject = project_id)
--
-- Token semantics: every old table stored its URL token RAW (none hashed),
-- so the stored value is copied verbatim into share_token and every issued
-- URL keeps resolving through the same equality lookup. Row ids are copied
-- so share ids in URLs / client state stay valid. No table had an inbound FK.
--
-- is_active (candidate / pitch / studio) becomes revoked_at:
--   is_active = false → revoked_at = updated_at (studio: now(), it had none).
-- studio_review_links stored project_id / user_id as text with no FK: rows
-- whose project_id is not a uuid can never resolve (the project join needs a
-- uuid) and are skipped; a user_id that is not a live user becomes NULL.
--
-- CI runs `drizzle-kit push --force` first, so the table, its indexes, FKs and
-- the CHECK already exist; every statement here is idempotent for the
-- no-push path and re-runs. Backfill is INSERT … SELECT … ON CONFLICT DO
-- NOTHING (covers both the copied id and the unique token). The old tables
-- are archived by 0588.

CREATE TABLE IF NOT EXISTS share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type varchar(32) NOT NULL,
  subject_id uuid NOT NULL,
  share_token text NOT NULL,
  label varchar(255),
  recipient_name varchar(255),
  recipient_email varchar(255),
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  created_by uuid,
  company_id uuid,
  redaction_profile_id uuid,
  whitelabel_tenant_id uuid,
  contact_ids jsonb,
  require_nda boolean,
  nda_accepted_at timestamptz,
  restrict_to_user_id uuid,
  max_uses integer,
  joined_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_links_subject ON share_links (subject_type, subject_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_share_links_share_token ON share_links (share_token);
CREATE INDEX IF NOT EXISTS idx_share_links_created_by ON share_links (created_by);
CREATE INDEX IF NOT EXISTS idx_share_links_company_id ON share_links (company_id);
CREATE INDEX IF NOT EXISTS idx_share_links_redaction_profile_id ON share_links (redaction_profile_id);
CREATE INDEX IF NOT EXISTS idx_share_links_whitelabel_tenant_id ON share_links (whitelabel_tenant_id);
CREATE INDEX IF NOT EXISTS idx_share_links_restrict_to_user_id ON share_links (restrict_to_user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_subject_type_check') THEN
    ALTER TABLE share_links ADD CONSTRAINT share_links_subject_type_check
      CHECK (subject_type IN ('candidate_resume', 'pitch_deck', 'pipeline_job', 'studio_review', 'reference_packet', 'game_play')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_created_by_users_id_fk') THEN
    ALTER TABLE share_links ADD CONSTRAINT share_links_created_by_users_id_fk
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_company_id_company_profiles_id_fk') THEN
    ALTER TABLE share_links ADD CONSTRAINT share_links_company_id_company_profiles_id_fk
      FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_redaction_profile_id_redaction_profiles_id_fk') THEN
    ALTER TABLE share_links ADD CONSTRAINT share_links_redaction_profile_id_redaction_profiles_id_fk
      FOREIGN KEY (redaction_profile_id) REFERENCES redaction_profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_whitelabel_tenant_id_whitelabel_tenants_id_fk') THEN
    ALTER TABLE share_links ADD CONSTRAINT share_links_whitelabel_tenant_id_whitelabel_tenants_id_fk
      FOREIGN KEY (whitelabel_tenant_id) REFERENCES whitelabel_tenants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'share_links_restrict_to_user_id_users_id_fk') THEN
    ALTER TABLE share_links ADD CONSTRAINT share_links_restrict_to_user_id_users_id_fk
      FOREIGN KEY (restrict_to_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Backfill (each source guarded: a fresh DB may never have had it) ─────────

DO $$
BEGIN
  IF to_regclass('public.candidate_resume_shares') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO share_links (
        id, subject_type, subject_id, share_token, label, recipient_email,
        expires_at, revoked_at, view_count, last_viewed_at, created_by,
        company_id, redaction_profile_id, whitelabel_tenant_id, created_at, updated_at
      )
      SELECT id, 'candidate_resume', candidate_resume_id, share_token, name, recipient_email,
             expires_at, CASE WHEN is_active THEN NULL ELSE updated_at END, view_count, last_viewed_at,
             shared_by_user_id, company_id, redaction_profile_id, whitelabel_tenant_id, created_at, updated_at
      FROM public.candidate_resume_shares
      ON CONFLICT DO NOTHING
    $q$;
  END IF;

  IF to_regclass('public.pitch_deck_shares') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO share_links (
        id, subject_type, subject_id, share_token, recipient_name, recipient_email,
        expires_at, revoked_at, view_count, last_viewed_at, created_by, created_at, updated_at
      )
      SELECT id, 'pitch_deck', deck_id, share_token, recipient_name, recipient_email,
             expires_at, CASE WHEN is_active THEN NULL ELSE updated_at END, view_count, last_viewed_at,
             shared_by_user_id, created_at, updated_at
      FROM public.pitch_deck_shares
      ON CONFLICT DO NOTHING
    $q$;
  END IF;

  IF to_regclass('public.pipeline_share_links') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO share_links (
        id, subject_type, subject_id, share_token, label, expires_at, created_by, created_at, updated_at
      )
      SELECT id, 'pipeline_job', job_id, share_token, label, expires_at, created_by_user_id, created_at, created_at
      FROM public.pipeline_share_links
      ON CONFLICT DO NOTHING
    $q$;
  END IF;

  IF to_regclass('public.studio_review_links') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO share_links (
        id, subject_type, subject_id, share_token, label, expires_at, revoked_at, created_by, created_at, updated_at
      )
      SELECT l.id, 'studio_review',
             CASE WHEN l.project_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN l.project_id::uuid END,
             l.share_token, l.name, l.expires_at,
             CASE WHEN l.is_active THEN NULL ELSE now() END,
             u.id, l.created_at, l.created_at
      FROM public.studio_review_links l
      LEFT JOIN users u
        ON u.id = CASE WHEN l.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN l.user_id::uuid END
      WHERE l.project_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ON CONFLICT DO NOTHING
    $q$;
  END IF;

  IF to_regclass('public.reference_shares') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO share_links (
        id, subject_type, subject_id, share_token, label, recipient_email, expires_at, revoked_at,
        first_viewed_at, created_by, contact_ids, require_nda, nda_accepted_at, created_at, updated_at
      )
      SELECT id, 'reference_packet', owner_user_id, token, label, shared_with_email, expires_at, revoked_at,
             first_viewed_at, owner_user_id, contact_ids, require_nda, nda_accepted_at, created_at, updated_at
      FROM public.reference_shares
      ON CONFLICT DO NOTHING
    $q$;
  END IF;

  IF to_regclass('public.game_play_invites') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO share_links (
        id, subject_type, subject_id, share_token, label, expires_at, revoked_at, created_by,
        restrict_to_user_id, max_uses, joined_count, created_at, updated_at
      )
      SELECT id, 'game_play', project_id, token, label, expires_at, revoked_at, created_by,
             restrict_to_user_id, max_uses, joined_count, created_at, created_at
      FROM public.game_play_invites
      ON CONFLICT DO NOTHING
    $q$;
  END IF;
END $$;
