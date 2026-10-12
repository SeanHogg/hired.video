-- Migration 0520 — résumé templates fold into studio templates.
--
-- Owner decision (2026-10-10): "resume templates should fold into studio
-- templates". ONE template concept: a résumé template is a studio template
-- whose document kind is résumé — a column value, not a separate table or
-- flow.
--
--   studio_templates.document_kind  'resume' | 'article' | 'job' | 'blog'
--                                   (shared/document-entity-kinds.ts), set
--                                   for media_kind = 'document' rows only.
--
-- What this file does, in order:
--   1. adds document_kind (+ CHECK, NOT VALID per TEMPLATE.md rule 5) and
--      backfills it from each document template's payload `entityKind`;
--   2. copies every legacy `resume_templates` row into studio_templates,
--      keeping its id (reviews + tool_runs reference it) and its listing
--      slug (suffixed with the id only if a studio template already owns
--      that slug). Platform-seeded rows (created_by NULL) are attributed to
--      the "hired.video Community" first-party publisher, the same rule
--      scripts/seed-first-party-templates.mjs uses; without that company
--      they stay behind in the legacy table;
--   3. grants each copied template's creator the 'owner' license studio
--      publishing always grants;
--   4. re-points `template_licenses` rows recorded as 'resume' that name a
--      studio template — by id (the copied rows) or by listing slug (the
--      cart recorded paid creator templates as `template:<slug>` →
--      ('resume', <slug>)) — to ('studio', <studio_templates.id>). A grant
--      whose 'studio' twin already exists is left as is (never deleted:
--      it may carry a payment ref). 'resume' grants on built-in preset ids
--      stay as legacy, read-only rows;
--   5. drops tool_runs' FK to resume_templates (template_id is now a studio
--      template id; the FK to studio_templates lands with the table drop).
--
-- `resume_templates` itself is NOT dropped here: CI runs `drizzle-kit push`
-- BEFORE the SQL migrations, so the table stays declared (read by nothing)
-- until this file has run in production; a follow-up migration drops it.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, pg_constraint-gated constraint,
-- ON CONFLICT DO NOTHING inserts, re-point updates that only match rows
-- still in the old shape, DROP CONSTRAINT IF EXISTS. Safe in either order
-- with push (which may already have added the column + CHECK from
-- db/schema/studiotemplates.ts).

-- 1. document_kind ----------------------------------------------------------

ALTER TABLE studio_templates ADD COLUMN IF NOT EXISTS document_kind varchar(24);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_templates_document_kind_check') THEN
    ALTER TABLE studio_templates
      ADD CONSTRAINT studio_templates_document_kind_check
      CHECK (document_kind IS NULL OR document_kind IN ('resume', 'article', 'job', 'blog')) NOT VALID;
  END IF;
END $$;

UPDATE studio_templates
   SET document_kind = video_script->>'entityKind'
 WHERE media_kind = 'document'
   AND document_kind IS NULL
   AND video_script->>'entityKind' IN ('resume', 'article', 'job', 'blog');

-- 2. copy resume_templates → studio_templates --------------------------------

WITH community AS (
  SELECT id AS company_id, owner_id
    FROM company_profiles
   WHERE name = 'hired.video Community'
   LIMIT 1
),
src AS (
  SELECT
    rt.*,
    COALESCE(rt.created_by, c.owner_id) AS creator,
    CASE WHEN rt.created_by IS NULL THEN c.company_id END AS company,
    -- Public = a marketplace listing, or a platform-curated free template
    -- (the legacy `is_public` flag on a row nobody authored).
    (rt.visibility = 'public' OR (rt.created_by IS NULL AND rt.is_public)) AS goes_public,
    COALESCE(
      rt.listing_slug,
      trim(both '-' from lower(regexp_replace(rt.name, '[^a-zA-Z0-9]+', '-', 'g')))
        || '-' || left(replace(rt.id::text, '-', ''), 8)
    ) AS base_slug
  FROM resume_templates rt
  LEFT JOIN community c ON true
)
INSERT INTO studio_templates (
  id, creator_id, company_id, source_project_id, media_kind, document_kind,
  name, description, thumbnail_url, preview_video_url, video_script,
  duration_sec, motion, language, tags, visibility, listing_slug,
  price_cents, currency, platform_fee_bps,
  consent_agreed_at, consent_ip, consent_ua,
  view_count, purchase_count, published_at, created_at, updated_at
)
SELECT
  src.id,
  src.creator,
  src.company,
  NULL,
  'document',
  'resume',
  left(src.name, 200),
  src.description,
  src.thumbnail_url,
  NULL,
  -- The payload is a content-stripped résumé DocumentState. A legacy row
  -- that already stores one keeps it (re-bound to no entity); any other
  -- shape is wrapped so nothing is lost: the design id it named (if any)
  -- becomes `templateId`, the original JSON rides along untouched.
  CASE
    WHEN jsonb_typeof(src.template_data->'pages') = 'array'
      THEN src.template_data || jsonb_build_object('entityKind', 'resume', 'entityId', NULL)
    ELSE jsonb_build_object('entityKind', 'resume', 'entityId', NULL, 'pages', '[]'::jsonb,
                            'legacyTemplateData', src.template_data)
         || CASE
              WHEN jsonb_typeof(src.template_data->'templateId') = 'string'
                THEN jsonb_build_object('templateId', src.template_data->'templateId')
              WHEN jsonb_typeof(src.template_data->'id') = 'string'
                THEN jsonb_build_object('templateId', src.template_data->'id')
              ELSE '{}'::jsonb
            END
  END,
  NULL,
  NULL,
  NULL,
  -- Sectors were the legacy card filter; they become tags (plus the
  -- career-pivot flag, which had its own column).
  COALESCE(src.sectors, '[]'::jsonb)
    || CASE WHEN src.is_pivot_template THEN '["career-pivot"]'::jsonb ELSE '[]'::jsonb END,
  CASE
    WHEN src.goes_public THEN 'public'
    WHEN src.visibility = 'unlisted' THEN 'unlisted'
    ELSE 'private'
  END,
  CASE
    WHEN NOT src.goes_public AND src.listing_slug IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM studio_templates st WHERE st.listing_slug = src.base_slug AND st.id <> src.id
    ) THEN src.base_slug || '-' || left(replace(src.id::text, '-', ''), 8)
    ELSE src.base_slug
  END,
  src.price_cents,
  'USD',
  src.platform_fee_bps,
  src.consent_agreed_at,
  src.consent_ip,
  src.consent_ua,
  0,
  0,
  CASE WHEN src.goes_public THEN COALESCE(src.consent_agreed_at, src.created_at) END,
  src.created_at,
  src.updated_at
FROM src
WHERE src.creator IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 3. owner licenses for the copied rows --------------------------------------

INSERT INTO template_licenses (user_id, template_kind, template_id, source)
SELECT st.creator_id, 'studio', st.id::text, 'owner'
  FROM studio_templates st
 WHERE st.id IN (SELECT id FROM resume_templates)
ON CONFLICT (user_id, template_kind, template_id) DO NOTHING;

-- 4. re-point 'resume' grants that name a studio template --------------------

-- …by id (grants on the copied legacy rows).
UPDATE template_licenses l
   SET template_kind = 'studio'
 WHERE l.template_kind = 'resume'
   AND EXISTS (SELECT 1 FROM studio_templates st WHERE st.id::text = l.template_id)
   AND NOT EXISTS (
     SELECT 1 FROM template_licenses d
      WHERE d.user_id = l.user_id AND d.template_kind = 'studio' AND d.template_id = l.template_id
   );

-- …by listing slug (paid creator templates bought through the cart). The
-- built-in résumé preset ids (shared/marketplace-template-listings.ts) are
-- excluded so a preset grant can never be captured by a lookalike slug.
UPDATE template_licenses l
   SET template_kind = 'studio',
       template_id = st.id::text
  FROM studio_templates st
 WHERE l.template_kind = 'resume'
   AND st.listing_slug = l.template_id
   AND l.template_id NOT IN (
     'hired-default', 'payroll-iron-gray', 'risk-asphalt', 'executive-taupe',
     'intern-education-first', 'hospitality-amber', 'creative-minimal',
     'software-engineer-graphite', 'healthcare-clinical-blue',
     'sales-growth-emerald', 'actor-headshot-hero', 'director-filmography-serif'
   )
   AND NOT EXISTS (
     SELECT 1 FROM template_licenses d
      WHERE d.user_id = l.user_id AND d.template_kind = 'studio' AND d.template_id = st.id::text
   );

-- 5. tool_runs.template_id no longer points at resume_templates ---------------

ALTER TABLE tool_runs DROP CONSTRAINT IF EXISTS tool_runs_template_id_fkey;
ALTER TABLE tool_runs DROP CONSTRAINT IF EXISTS tool_runs_template_id_resume_templates_id_fk;
