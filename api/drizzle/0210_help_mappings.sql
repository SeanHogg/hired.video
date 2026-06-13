-- Migration 0210 — context-aware help mappings + FAQ consolidation.
--
-- Part 1: `help_mappings` — a SuperAdmin curates which published help
--   articles surface on each *kind* of page, keyed on AIContextType (the
--   route→context seam reused from the AI brain; see shared/help.ts).
--   Mirrors the page_embed_videos registry: route→resource binding,
--   soft `is_active` toggle, one row per (context, article).
--
-- Part 2: consolidate the static FAQ catalogue (was
--   frontend/data/help-faqs.ts) into the `articles` table as kind='faq'
--   under the editorial house author (seeded in 0113). This makes help
--   content searchable (UnifiedSearch already indexes articles), part of
--   the SuperAdmin moderation/review SSoT, and mappable to page context.
--
-- Idempotent per drizzle/TEMPLATE.md.

-- ── Part 1: registry table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS help_mappings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- AIContextType value (e.g. "resume-edit"). Code enum, validated at the route.
  context_key  VARCHAR(64) NOT NULL,
  article_id   UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One curation row per (context, article); POST upserts on this.
CREATE UNIQUE INDEX IF NOT EXISTS uq_help_mappings_context_article
  ON help_mappings (context_key, article_id);

-- The public resolve reads active rows for a context, ordered.
CREATE INDEX IF NOT EXISTS idx_help_mappings_context_active
  ON help_mappings (context_key, is_active, position);

-- ── Part 2: ensure the editorial house author exists ──────────────────
-- (Seeded by 0113; re-asserted here so 0210 is self-contained.)
INSERT INTO "users" (
  "id", "email", "name", "email_verified", "is_active", "is_system", "role", "created_at", "updated_at"
) VALUES (
  (md5('editorial@hired.video'))::uuid, 'editorial@hired.video', 'hired.video Editorial',
  true, true, true, 'job_seeker', NOW(), NOW()
)
ON CONFLICT ("email") DO UPDATE
  SET "is_system" = true, "email_verified" = true, "updated_at" = NOW();

-- ── Part 2: seed FAQ articles (kind='faq', published) ─────────────────
-- Idempotent via (user_id, slug). To edit an answer, delete the row + re-run.
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "kind", "status", "published_at", "read_minutes"
) VALUES
  ((md5('editorial@hired.video'))::uuid, 'faq-create-first-video-resume',
   'How do I create my first video resume?',
   'To create your video resume, go to the Resumes section and click ''Create Video Resume''. You can either upload your own video or use our AI-powered video generation tool to create one from your existing resume.',
   'Create a video resume from the Resumes section — upload your own or generate one with AI.',
   'Getting Started', '["faq","getting-started"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-supported-file-formats',
   'What file formats are supported for uploads?',
   'We support common video formats (MP4, MOV, AVI) for video uploads and PDF, DOC, DOCX for text resumes. Maximum file size is 100MB for videos and 10MB for documents.',
   'MP4/MOV/AVI video (max 100MB); PDF/DOC/DOCX documents (max 10MB).',
   'Getting Started', '["faq","getting-started"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-set-up-profile',
   'How do I set up my profile?',
   'After signing up, you''ll be guided through our onboarding process. Complete your profile by adding your personal information, work experience, skills, and upload your resume or create a video resume.',
   'Onboarding walks you through profile setup: details, experience, skills, and a resume.',
   'Getting Started', '["faq","getting-started"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-change-password',
   'How do I change my password?',
   'Go to Settings > Account and click ''Change Password''. You''ll need to enter your current password and choose a new one.',
   'Settings > Account > Change Password.',
   'Account & Settings', '["faq","account"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-change-persona-type',
   'Can I change my role after registration?',
   'Yes, you can update your role (Job Seeker, Recruiter, Employer) in your Profile settings. Note that this will change your dashboard and available features.',
   'Yes — update your role in Profile settings; it changes your dashboard and features.',
   'Account & Settings', '["faq","account"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-delete-account',
   'How do I delete my account?',
   'Account deletion can be done from Settings > Account > Delete Account. This action is permanent and cannot be undone.',
   'Settings > Account > Delete Account — permanent and irreversible.',
   'Account & Settings', '["faq","account"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-good-video-resume',
   'What makes a good video resume?',
   'A good video resume should be 1-3 minutes long, professionally presented, highlight your key skills and experience, and include a clear call to action. Use good lighting and audio quality.',
   'Keep it 1-3 minutes, well-lit, clear audio, key skills, and a clear call to action.',
   'Video Resumes', '["faq","video-resume"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-edit-video-resume',
   'Can I edit my video resume after uploading?',
   'Yes, you can edit the title, description, and tags of your video resume. To change the video content itself, you''ll need to upload a new version.',
   'Edit title/description/tags anytime; upload a new version to change the footage.',
   'Video Resumes', '["faq","video-resume"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-private-video-resume',
   'How do I make my video resume private?',
   'In your video resume settings, you can change the visibility to ''Private'', ''Unlisted'', or ''Public''. Private videos are only visible to you.',
   'Set visibility to Private/Unlisted/Public in the video settings.',
   'Video Resumes', '["faq","video-resume"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-job-matching',
   'How does job matching work?',
   'Our AI analyzes your profile, skills, and preferences to match you with relevant job opportunities. You can refine matches by updating your preferences in Settings.',
   'AI matches you on profile, skills, and preferences — refine in Settings.',
   'Job Search', '["faq","job-search"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-track-applications',
   'Can I track my job applications?',
   'Yes, the Jobs section includes an application tracker where you can monitor the status of all your applications and set follow-up reminders.',
   'Yes — the Jobs section has an application tracker with follow-up reminders.',
   'Job Search', '["faq","job-search"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-job-match-notifications',
   'How do I get notified about new job matches?',
   'Enable job notifications in Settings > Notifications. You can choose to receive alerts via email or push notifications.',
   'Enable job notifications in Settings > Notifications (email or push).',
   'Job Search', '["faq","job-search"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-post-a-job',
   'How do I post a job opening?',
   'Go to the Jobs section and click ''Post New Job''. Fill in the job details, requirements, and company information. Your posting will be visible to matching candidates.',
   'Jobs > Post New Job — add details, requirements, and company info.',
   'For Recruiters', '["faq","recruiter"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-search-candidates',
   'Can I search for candidates by specific criteria?',
   'Yes, use the People section to search and filter candidates by skills, experience level, location, and other criteria. You can save searches for future use.',
   'Yes — filter candidates in People by skills, experience, and location; save searches.',
   'For Recruiters', '["faq","recruiter"]'::jsonb, 'faq', 'published', NOW(), 1),

  ((md5('editorial@hired.video'))::uuid, 'faq-candidate-pipeline',
   'How do I manage my candidate pipeline?',
   'The Dashboard provides a pipeline view where you can track candidates through different stages of your hiring process, from initial contact to hiring.',
   'Track candidates through hiring stages in the Dashboard pipeline view.',
   'For Recruiters', '["faq","recruiter"]'::jsonb, 'faq', 'published', NOW(), 1)
ON CONFLICT ("user_id", "slug") DO NOTHING;

-- ── Part 1+2: seed initial context→article mappings ───────────────────
-- VALUES(context, slug, position) joined to the seeded articles. Reusing
-- the slug keeps this readable + decoupled from generated UUIDs.
INSERT INTO help_mappings (context_key, article_id, position)
SELECT m.context_key, a.id, m.position
FROM (VALUES
  ('general',      'faq-create-first-video-resume', 0),
  ('general',      'faq-supported-file-formats',    1),
  ('general',      'faq-set-up-profile',            2),
  ('dashboard',    'faq-set-up-profile',            0),
  ('dashboard',    'faq-candidate-pipeline',        1),
  ('profile-edit', 'faq-set-up-profile',            0),
  ('profile-edit', 'faq-change-password',           1),
  ('profile-edit', 'faq-change-persona-type',       2),
  ('profile-edit', 'faq-delete-account',            3),
  ('studio',       'faq-create-first-video-resume', 0),
  ('studio',       'faq-good-video-resume',         1),
  ('studio',       'faq-edit-video-resume',         2),
  ('studio',       'faq-private-video-resume',      3),
  ('resume-edit',  'faq-good-video-resume',         0),
  ('resume-edit',  'faq-edit-video-resume',         1),
  ('resume-create','faq-create-first-video-resume', 0),
  ('resume-create','faq-good-video-resume',         1),
  ('resume-view',  'faq-private-video-resume',      0),
  ('resume-view',  'faq-edit-video-resume',         1),
  ('job-list',     'faq-job-matching',              0),
  ('job-list',     'faq-track-applications',        1),
  ('job-list',     'faq-job-match-notifications',   2),
  ('search',       'faq-job-matching',              0),
  ('search',       'faq-search-candidates',         1),
  ('job-create',   'faq-post-a-job',                0),
  ('job-create',   'faq-search-candidates',         1)
) AS m(context_key, slug, position)
JOIN articles a
  ON a.user_id = (md5('editorial@hired.video'))::uuid AND a.slug = m.slug
ON CONFLICT (context_key, article_id) DO NOTHING;
