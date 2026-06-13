-- Migration 0211 — consolidate the help GUIDES into the article store (#2003).
--
-- The six /guides/* pages are rich, interactive React surfaces. This seeds a
-- companion `kind='guide'` article per page (under the editorial house
-- author) so guides are first-class in the ONE content store: searchable
-- (UnifiedSearch + /api/help/search), mappable to a page context via
-- help_mappings (so the HelpDrawer can surface them), and renderable as a
-- standalone article. Each body is a concise overview that links to the full
-- interactive guide — NOT a duplicate of the rich page's content.
--
-- Pairs with 0210 (FAQ consolidation) to fully retire frontend/data/help-faqs.ts.
-- Idempotent per drizzle/TEMPLATE.md.

-- Ensure the editorial house author exists (seeded in 0113/0210).
INSERT INTO "users" (
  "id", "email", "name", "email_verified", "is_active", "is_system", "role", "created_at", "updated_at"
) VALUES (
  (md5('editorial@hired.video'))::uuid, 'editorial@hired.video', 'hired.video Editorial',
  true, true, true, 'job_seeker', NOW(), NOW()
)
ON CONFLICT ("email") DO UPDATE
  SET "is_system" = true, "email_verified" = true, "updated_at" = NOW();

INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "kind", "status", "published_at", "read_minutes"
) VALUES
  ((md5('editorial@hired.video'))::uuid, 'guide-getting-started',
   'Getting Started with hired.video',
   E'Set up your account and ship your first video resume in under 15 minutes.\n\n1. **Complete your profile** — add your experience, skills, and a photo so matches and recruiters see the full picture.\n2. **Create a video resume** — upload your own clip or generate one from your existing resume with the AI Studio.\n3. **Set your visibility** — choose Public, Unlisted, or Private per artifact.\n4. **Turn on job matching** — set preferences in Settings so relevant roles find you.\n\n👉 Open the full interactive walkthrough at [/guides/getting-started](/guides/getting-started).',
   'Set up your profile, create your first video resume, and turn on job matching in under 15 minutes.',
   'Getting Started', '["guide","getting-started"]'::jsonb, 'guide', 'published', NOW(), 4),

  ((md5('editorial@hired.video'))::uuid, 'guide-video-best-practices',
   'Video Resume Best Practices',
   E'A great video resume is short, well-lit, and ends with a clear ask.\n\n- **Keep it 1–3 minutes.** Lead with your strongest hook in the first 5 seconds.\n- **Light your face** from the front and frame at eye level.\n- **Clean audio beats clean video** — use a quiet room or a simple mic.\n- **Tell one story**, highlight 2–3 key skills, and close with a call to action.\n- **Iterate** — re-record and compare; small changes in energy read big on camera.\n\n👉 See the full guide with examples at [/guides/video-best-practices](/guides/video-best-practices).',
   'Keep it 1–3 minutes, well-lit, clear audio, one story, and a clear call to action.',
   'Video Resumes', '["guide","video-resume"]'::jsonb, 'guide', 'published', NOW(), 5),

  ((md5('editorial@hired.video'))::uuid, 'guide-networking',
   'Networking Tips',
   E'Your network is your highest-leverage job-search channel. Build it deliberately.\n\n- **Lead with value**, not asks — share work, comment thoughtfully, make introductions.\n- **Follow up within 24 hours** of any meaningful conversation.\n- **Keep a simple pipeline** — track who you''ve reached and when to circle back.\n- **Use your video resume** as a warm, memorable intro when you connect.\n\n👉 Read the full networking playbook at [/guides/networking](/guides/networking).',
   'Build professional connections that compound — lead with value, follow up fast, track your pipeline.',
   'Job Search', '["guide","networking"]'::jsonb, 'guide', 'published', NOW(), 5),

  ((md5('editorial@hired.video'))::uuid, 'guide-job-search',
   'Job Search Strategies',
   E'Run your search like a funnel: target, apply, follow up, convert.\n\n- **Target tightly** — a focused list of roles beats spraying applications.\n- **Tailor every application** with the resume tools and a role-specific video intro.\n- **Track applications** in the Jobs tracker and set follow-up reminders.\n- **Prep for interviews** with the interview-practice tools before each round.\n\n👉 Get the full strategy guide at [/guides/job-search](/guides/job-search).',
   'Target tightly, tailor every application, track follow-ups, and prep interviews — your search as a funnel.',
   'Job Search', '["guide","job-search"]'::jsonb, 'guide', 'published', NOW(), 6),

  ((md5('editorial@hired.video'))::uuid, 'guide-tutorials',
   'Tutorials',
   E'Step-by-step tutorials for every feature of hired.video — resumes, the video Studio, job search, and recruiting tools.\n\nStart with the basics and work up to advanced workflows like AI-generated video, the timeline editor, and candidate pipelines.\n\n👉 Browse all tutorials at [/guides/tutorials](/guides/tutorials).',
   'Step-by-step tutorials for every feature — resumes, the video Studio, job search, and recruiting.',
   'Getting Started', '["guide","tutorials"]'::jsonb, 'guide', 'published', NOW(), 3),

  ((md5('editorial@hired.video'))::uuid, 'guide-workforce',
   'Workforce & Timesheets (for agencies)',
   E'The agency back-office: invite employees, capture time, approve timesheets, derive invoices, manage compliance docs, and track desk margin.\n\n- **Invite your team** and set their roles.\n- **Capture and approve time**, then derive invoices automatically.\n- **Keep compliance docs** organized per worker.\n- **Watch desk margin** across placements.\n\n👉 Read the complete agency guide at [/guides/workforce](/guides/workforce).',
   'Agency back-office: invite employees, capture time, approve timesheets, derive invoices, track margin.',
   'For Recruiters', '["guide","agency","workforce"]'::jsonb, 'guide', 'published', NOW(), 7)
ON CONFLICT ("user_id", "slug") DO NOTHING;

-- Map guides to the page contexts where they help most (so the HelpDrawer
-- surfaces them in context). VALUES(context, slug, position) joined to the
-- seeded guide articles.
INSERT INTO help_mappings (context_key, article_id, position)
SELECT m.context_key, a.id, m.position
FROM (VALUES
  ('general',      'guide-getting-started',      10),
  ('general',      'guide-tutorials',            11),
  ('dashboard',    'guide-getting-started',      10),
  ('studio',       'guide-video-best-practices', 10),
  ('resume-edit',  'guide-video-best-practices', 10),
  ('resume-create','guide-video-best-practices', 10),
  ('profile-view', 'guide-networking',           10),
  ('profile-edit', 'guide-networking',           10),
  ('job-list',     'guide-job-search',           10),
  ('search',       'guide-job-search',           10),
  ('job-create',   'guide-workforce',            10)
) AS m(context_key, slug, position)
JOIN articles a
  ON a.user_id = (md5('editorial@hired.video'))::uuid AND a.slug = m.slug
ON CONFLICT (context_key, article_id) DO NOTHING;
