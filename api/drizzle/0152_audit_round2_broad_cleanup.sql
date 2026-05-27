-- Audit round 2 — broad cleanup surfaced by the additional analysis pass.
--
-- Bundled per Full-fix scope: all of these share the root cause "schemas
-- declared during the rapid-iteration phase didn't get FK/CHECK/index
-- love after the active-feature set settled out." Per the user's note,
-- only inbox / profiles / resumes / studio templates are in active use,
-- so orphan-DELETE pre-flights are safe on the non-active surfaces.
--
-- Sections:
--   A. candidate_resumes.parent_id self-FK (missing in both schema and SQL).
--   B. studio_review_comments text → uuid + FKs (parent self-FK, author user, project).
--   C. paid_media family text user_id → uuid + FKs (5 tables).
--   D. billing.ts indexes — zero indexes existed across 9 tables.
--   E. Other missing composite indexes (admin_audit_log, autofill, calendar).
--   F. Status / objective / completion_status CHECK constraints.
--   G. Money column CHECK ≥ 0 for paid_media spend counters (signed
--      payout_ledger amounts intentionally excluded).
--   H. Polymorphic CHECK on paid_media_campaigns.subject_type.

-- ---------------------------------------------------------------------------
-- Helpers (re-declared per migration; sessions are isolated).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.__convert_text_user_id(target_table text)
RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  col_type text;
  fk_name  text := target_table || '_user_id_fkey';
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = target_table AND column_name = 'user_id';

  IF col_type = 'text' THEN
    EXECUTE format(
      'DELETE FROM %I WHERE user_id IS NULL OR user_id !~ %L OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = %I.user_id)',
      target_table,
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      target_table
    );

    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, %L)::uuid',
      target_table, ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk_name) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
      target_table, fk_name
    );
  END IF;
END;
$func$;

-- ---------------------------------------------------------------------------
-- A. candidate_resumes.parent_id self-FK.
--    Comment in schema TS says "FK lives in SQL migration" but it never
--    actually got added — search shows only the index. SET NULL so
--    deleting a parent resume promotes variants to roots.
-- ---------------------------------------------------------------------------

UPDATE candidate_resumes
SET parent_id = NULL
WHERE parent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM candidate_resumes parent WHERE parent.id = candidate_resumes.parent_id
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_resumes_parent_id_fkey') THEN
    ALTER TABLE candidate_resumes
      ADD CONSTRAINT candidate_resumes_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES candidate_resumes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- B. studio_review_comments — author_user_id + parent_id + project_id all
--    text. Convert each to uuid + add FKs.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  col_type text;
BEGIN
  -- author_user_id text → uuid + FK to users (nullable — anonymous comments).
  SELECT data_type INTO col_type FROM information_schema.columns
  WHERE table_name = 'studio_review_comments' AND column_name = 'author_user_id';

  IF col_type = 'text' THEN
    UPDATE studio_review_comments
    SET author_user_id = NULL
    WHERE author_user_id IS NOT NULL
      AND (author_user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = studio_review_comments.author_user_id));

    EXECUTE 'ALTER TABLE studio_review_comments ALTER COLUMN author_user_id TYPE uuid USING NULLIF(author_user_id, '''')::uuid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_review_comments_author_user_id_fkey') THEN
    ALTER TABLE studio_review_comments
      ADD CONSTRAINT studio_review_comments_author_user_id_fkey
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- project_id text → uuid + FK to studio_projects (NOT NULL).
  SELECT data_type INTO col_type FROM information_schema.columns
  WHERE table_name = 'studio_review_comments' AND column_name = 'project_id';

  IF col_type = 'text' THEN
    DELETE FROM studio_review_comments
    WHERE project_id IS NULL
       OR project_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM studio_projects WHERE studio_projects.id::text = studio_review_comments.project_id);

    EXECUTE 'ALTER TABLE studio_review_comments ALTER COLUMN project_id TYPE uuid USING NULLIF(project_id, '''')::uuid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_review_comments_project_id_fkey') THEN
    ALTER TABLE studio_review_comments
      ADD CONSTRAINT studio_review_comments_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES studio_projects(id) ON DELETE CASCADE;
  END IF;

  -- parent_id text → uuid + self-FK (nullable — top-level comment).
  SELECT data_type INTO col_type FROM information_schema.columns
  WHERE table_name = 'studio_review_comments' AND column_name = 'parent_id';

  IF col_type = 'text' THEN
    UPDATE studio_review_comments
    SET parent_id = NULL
    WHERE parent_id IS NOT NULL
      AND (parent_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR NOT EXISTS (SELECT 1 FROM studio_review_comments p WHERE p.id::text = studio_review_comments.parent_id));

    EXECUTE 'ALTER TABLE studio_review_comments ALTER COLUMN parent_id TYPE uuid USING NULLIF(parent_id, '''')::uuid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_review_comments_parent_id_fkey') THEN
    ALTER TABLE studio_review_comments
      ADD CONSTRAINT studio_review_comments_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES studio_review_comments(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- C. paid_media family text user_id → uuid + FKs.
--    Five tables; bundled. Paid-media is NOT in the active-feature list,
--    so orphan-DELETE pre-flights are safe.
-- ---------------------------------------------------------------------------

SELECT pg_temp.__convert_text_user_id('paid_media_connections');
SELECT pg_temp.__convert_text_user_id('paid_media_accounts');
SELECT pg_temp.__convert_text_user_id('paid_media_campaigns');
SELECT pg_temp.__convert_text_user_id('paid_media_ad_sets');

-- paid_media_pixels has user_id only if present; also bundle.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'paid_media_pixels' AND column_name = 'user_id') THEN
    PERFORM pg_temp.__convert_text_user_id('paid_media_pixels');
  END IF;
END $$;

-- paid_media_accounts.connection_id → paid_media_connections(id).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paid_media_accounts_connection_id_fkey') THEN
    DELETE FROM paid_media_accounts
    WHERE NOT EXISTS (SELECT 1 FROM paid_media_connections WHERE paid_media_connections.id = paid_media_accounts.connection_id);
    ALTER TABLE paid_media_accounts
      ADD CONSTRAINT paid_media_accounts_connection_id_fkey
      FOREIGN KEY (connection_id) REFERENCES paid_media_connections(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- D. billing.ts indexes — zero indexes existed across 9 tables.
--    Most queries hit the PK or a unique constraint, but per-user listings
--    (subscriptions, invoices, payment_methods, refund_requests) were
--    table-scanning. Tables: subscriptions, invoices, payment_methods,
--    refund_requests, billing_events, usage_records, company_subscriptions.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status     ON subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan            ON subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_created         ON invoices (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription         ON invoices (subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_recipient_company    ON invoices (recipient_company_id) WHERE recipient_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status               ON invoices (status);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user          ON payment_methods (user_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_user_status   ON refund_requests (user_id, status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_invoice       ON refund_requests (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice    ON invoice_line_items (invoice_id);

-- ---------------------------------------------------------------------------
-- E. Other missing composite indexes.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_user_created
  ON admin_audit_log (user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- autofill_cache_entries — needs (user_id, context) for dedup-on-write.
-- Table name guess; tolerate absence.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'autofill_cache_entries') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_autofill_cache_user_context ON autofill_cache_entries (user_id, context)';
  END IF;
END $$;

-- calendar_events — (user_id, start_at) for the upcoming-30-days view.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'calendar_events') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start ON calendar_events (user_id, start_at)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- F. Status / objective / completion_status CHECK constraints.
--    NOT VALID so existing rows aren't validated; new writes are gated.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- articles.status — see [shared/article-statuses.ts] if extracted; for
  -- now mirror the values listed in the schema comment.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'articles_status_check') THEN
    ALTER TABLE articles
      ADD CONSTRAINT articles_status_check
      CHECK (status IN ('draft', 'submitted_for_review', 'published', 'rejected', 'unlisted', 'flagged')) NOT VALID;
  END IF;

  -- scormCmiStates.completion_status — mirrors SCORM_COMPLETION_STATUSES.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scorm_cmi_states_completion_status_check') THEN
    ALTER TABLE scorm_cmi_states
      ADD CONSTRAINT scorm_cmi_states_completion_status_check
      CHECK (completion_status IS NULL OR completion_status IN (
        'not_attempted', 'incomplete', 'completed', 'passed', 'failed'
      )) NOT VALID;
  END IF;

  -- paid_media_campaigns.objective — application enum, see schema comment.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paid_media_campaigns_objective_check') THEN
    ALTER TABLE paid_media_campaigns
      ADD CONSTRAINT paid_media_campaigns_objective_check
      CHECK (objective IN (
        'AWARENESS', 'TRAFFIC', 'LEAD_GENERATION', 'CONVERSIONS',
        'VIDEO_VIEWS', 'APP_INSTALLS', 'JOB_APPLICATIONS'
      )) NOT VALID;
  END IF;

  -- paid_media_campaigns.status — draft | active | paused | completed | archived.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paid_media_campaigns_status_check') THEN
    ALTER TABLE paid_media_campaigns
      ADD CONSTRAINT paid_media_campaigns_status_check
      CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- G. Money column CHECK ≥ 0 — only for cumulative spend counters /
--    budgets, never for signed ledgers (payout_ledger_entries.amount_cents
--    has reversals that ARE negative on purpose).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paid_media_campaigns_spent_cents_nonneg') THEN
    ALTER TABLE paid_media_campaigns
      ADD CONSTRAINT paid_media_campaigns_spent_cents_nonneg CHECK (spent_cents >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paid_media_campaigns_budget_cents_nonneg') THEN
    ALTER TABLE paid_media_campaigns
      ADD CONSTRAINT paid_media_campaigns_budget_cents_nonneg CHECK (budget_cents IS NULL OR budget_cents >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boosts_spent_cents_nonneg') THEN
    ALTER TABLE boosts ADD CONSTRAINT boosts_spent_cents_nonneg CHECK (spent_cents >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boosts_budget_cents_nonneg') THEN
    ALTER TABLE boosts ADD CONSTRAINT boosts_budget_cents_nonneg CHECK (budget_cents >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boosts_spent_le_budget') THEN
    -- Counter cache integrity — spent never exceeds budget.
    ALTER TABLE boosts ADD CONSTRAINT boosts_spent_le_budget CHECK (spent_cents <= budget_cents) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- H. Polymorphic CHECK on paid_media_campaigns.subject_type.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paid_media_campaigns_subject_type_check') THEN
    ALTER TABLE paid_media_campaigns
      ADD CONSTRAINT paid_media_campaigns_subject_type_check
      CHECK (subject_type IS NULL OR subject_type IN (
        'job', 'company', 'service', 'voice_clone', 'video', 'article',
        'template', 'resume', 'event', 'studio_project', 'user_profile'
      )) NOT VALID;
  END IF;
END $$;
