-- gap #1966 — badge seed for the new gamification surfaces.
--
-- Catalog entries (ACTIONS.* + POINTS_CATALOG) + the badge-engine
-- considerBadge() cases live in api/src/domains/gamification/{rules,badge-engine}.ts.
-- This migration seeds the badge *rows* those slugs resolve to. The badge
-- engine looks the badge up by slug (findBadgeBySlug) at unlock time, so a
-- catalog case with no seeded row is a silent no-op — these rows are what
-- make the new badges real.
--
-- All eligible across the three scoring roles (job_seeker / recruiter /
-- employer), matching the catalog rules. ON CONFLICT (slug) DO NOTHING so
-- the SQL runner can re-apply this file idempotently.

INSERT INTO "badges" (slug, name, description, tier, icon_key, points_reward, roles, is_repeatable) VALUES
  -- Events
  ('event_host_first',         'Event Host',         'Created your first event.',                 'bronze', 'calendar-plus', 50,  '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('event_attendee_first',     'Showed Up',          'Registered for your first event.',          'bronze', 'calendar-check', 25, '["job_seeker","recruiter","employer"]'::jsonb, false),

  -- Bookings / sessions
  ('session_host_first',       'Open for Business',  'Completed your first booked session.',      'bronze', 'video',        75,  '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('session_host_10',          'Trusted Mentor',     'Completed ten booked sessions.',            'gold',   'video',        500, '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('session_booked_first',     'Booked In',          'Booked your first session.',                'bronze', 'calendar',     25,  '["job_seeker","recruiter","employer"]'::jsonb, false),

  -- Articles
  ('first_article',            'Published Author',   'Published your first article.',             'bronze', 'pen-line',     75,  '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('articles_10',              'Prolific Writer',    'Published ten articles.',                   'gold',   'pen-line',     500, '["job_seeker","recruiter","employer"]'::jsonb, false),

  -- References
  ('reference_given_first',    'Good Word',          'Gave your first reference.',                'bronze', 'thumbs-up',    50,  '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('reference_received_first', 'Vouched For',        'Received your first reference.',            'bronze', 'badge-check',  25,  '["job_seeker","recruiter","employer"]'::jsonb, false),

  -- Company reviews
  ('first_company_review',     'Straight Talk',      'Posted your first company review.',         'bronze', 'message-square', 25, '["job_seeker","recruiter","employer"]'::jsonb, false),

  -- Educator / cohort / student
  ('educator_first_cohort',    'Educator',           'Created your first learning cohort.',       'silver', 'users',        150, '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('student_enrolled',         'Enrolled',           'Joined your first learning cohort.',        'bronze', 'user-plus',    25,  '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('first_assignment_completed','Assignment Done',   'Completed your first cohort assignment.',   'bronze', 'clipboard-check', 50, '["job_seeker","recruiter","employer"]'::jsonb, false),

  -- Creative studio "create" kinds
  ('studio_creator_first',     'Studio Creator',     'Published your first game, comic, or podcast.', 'silver', 'wand', 150, '["job_seeker","recruiter","employer"]'::jsonb, false)
ON CONFLICT (slug) DO NOTHING;
