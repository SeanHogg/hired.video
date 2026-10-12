-- Migration 0191 — Community Resources directory.
--
-- Location-scoped, user-submitted directory of job-seeker / employer help
-- (government agencies, unemployment offices, job boards, training, legal
-- aid, veterans services). Submissions land `pending`; a SuperAdmin approves
-- before they render on /in/:country/:state location pages.
--
-- Also seeds:
--   • two contributor badges (resource_first, resources_10), and
--   • the launch directory for Texas (job seekers + employers) and Michigan
--     (government agencies) researched for this feature. A resource carries
--     a link, a phone number, or both — the seed exercises all three shapes.
--
-- Idempotent per drizzle/TEMPLATE.md.

CREATE TABLE IF NOT EXISTS community_resources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  title            VARCHAR(200) NOT NULL,
  description      TEXT NOT NULL,
  url              TEXT,
  phone            VARCHAR(64),
  category         VARCHAR(40) NOT NULL,
  audience         VARCHAR(16) NOT NULL,
  country_code     VARCHAR(8) NOT NULL,
  state_code       VARCHAR(16),
  city_slug        VARCHAR(96),
  status           VARCHAR(16) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected')),
  reviewed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_resources_geo
  ON community_resources (country_code, state_code, status);
CREATE INDEX IF NOT EXISTS idx_community_resources_status
  ON community_resources (status, created_at);
CREATE INDEX IF NOT EXISTS idx_community_resources_submitter
  ON community_resources (submitted_by, created_at);

-- ── Contributor badges ───────────────────────────────────────────────────
INSERT INTO badges (slug, name, description, tier, icon_key, points_reward, roles, is_repeatable)
VALUES
  ('resource_first', 'Local Guide', 'Submitted your first community resource.', 'bronze', 'map-pin', 50, '["job_seeker","recruiter","employer"]'::jsonb, false),
  ('resources_10', 'Community Builder', 'Submitted 10 community resources.', 'silver', 'library', 200, '["job_seeker","recruiter","employer"]'::jsonb, false)
ON CONFLICT (slug) DO NOTHING;

-- ── Texas launch directory (job seekers + employers) ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM community_resources
    WHERE submitted_by IS NULL AND country_code = 'us' AND state_code = 'tx'
  ) THEN
    INSERT INTO community_resources
      (title, description, url, phone, category, audience, country_code, state_code, status)
    VALUES
      ('Texas Workforce Commission — Unemployment Benefits',
       'Apply for and manage unemployment benefit claims in Texas. Speak to a representative or use the Tele-Serv automated line.',
       'https://www.twc.texas.gov/programs/unemployment-benefits', '800-939-6631',
       'unemployment', 'job_seeker', 'us', 'tx', 'approved'),
      ('WorkInTexas.com',
       'The state job board operated by the Texas Workforce Commission. Build a profile, search statewide openings, and apply.',
       'https://www.workintexas.com', NULL,
       'job_board', 'job_seeker', 'us', 'tx', 'approved'),
      ('Workforce Solutions Offices (Texas)',
       'Free in-person job search help, training referrals, and child-care assistance at local Workforce Solutions career centers across Texas.',
       'https://www.twc.texas.gov/find-locations', '800-558-8321',
       'workforce_center', 'job_seeker', 'us', 'tx', 'approved'),
      ('Texas Workforce Solutions — Vocational Rehabilitation',
       'Employment services and support for Texans with disabilities who want to work, keep a job, or prepare for a career.',
       'https://www.twc.texas.gov/programs/vocational-rehabilitation', '800-628-5115',
       'disability', 'job_seeker', 'us', 'tx', 'approved'),
      ('Texas Veterans Commission',
       'Employment services, claims help, and education benefits for Texas veterans and their families.',
       'https://www.tvc.texas.gov', '800-252-8387',
       'veterans', 'job_seeker', 'us', 'tx', 'approved'),
      ('Texas Law Help — Workers'' Rights',
       'Free legal information and aid referrals on wages, wrongful termination, and workplace rights for low-income Texans.',
       'https://texaslawhelp.org', NULL,
       'legal_aid', 'job_seeker', 'us', 'tx', 'approved'),
      ('Texas Workforce Commission — Unemployment Tax (Employers)',
       'Register as an employer, file wage reports, and pay unemployment tax. Includes the employer response (ERN) portal for benefit claims.',
       'https://www.twc.texas.gov/programs/unemployment-tax', '800-832-9394',
       'employer_services', 'employer', 'us', 'tx', 'approved'),
      ('Texas 2-1-1 (HHS)',
       'Statewide hotline connecting Texans to food, rent, utility, and emergency assistance programs. Dial 2-1-1 from any phone.',
       'https://www.211texas.org', '211',
       'financial_assistance', 'both', 'us', 'tx', 'approved');
  END IF;
END $$;

-- ── Michigan launch directory (government agencies) ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM community_resources
    WHERE submitted_by IS NULL AND country_code = 'us' AND state_code = 'mi'
  ) THEN
    INSERT INTO community_resources
      (title, description, url, phone, category, audience, country_code, state_code, status)
    VALUES
      ('Michigan Unemployment Insurance Agency (UIA)',
       'Apply for unemployment benefits, certify, and manage your claim through the Michigan Web Account Manager (MiWAM).',
       'https://www.michigan.gov/uia', '866-500-0017',
       'unemployment', 'job_seeker', 'us', 'mi', 'approved'),
      ('Pure Michigan Talent Connect',
       'Michigan''s official talent portal — create a job seeker profile with MiLogin and search verified statewide openings.',
       'https://www.mitalent.org', NULL,
       'job_board', 'job_seeker', 'us', 'mi', 'approved'),
      ('Michigan Works!',
       'Personalized career coaching, resume help, interview practice, and training referrals at Michigan Works! service centers.',
       'https://www.michiganworks.org', NULL,
       'workforce_center', 'job_seeker', 'us', 'mi', 'approved'),
      ('Michigan Dept. of Labor & Economic Opportunity (LEO)',
       'The state department overseeing workforce development, unemployment, and labor relations for workers and employers.',
       'https://www.michigan.gov/leo', NULL,
       'government_agency', 'both', 'us', 'mi', 'approved'),
      ('Michigan Rehabilitation Services',
       'Vocational rehabilitation and employment support for Michigan residents with disabilities.',
       'https://www.michigan.gov/mdhhs/adult-child-services/mrs', NULL,
       'disability', 'job_seeker', 'us', 'mi', 'approved'),
      ('Michigan Veterans Affairs Agency',
       'Employment, benefits, and transition support for Michigan veterans. Dial the MICH-VET line for help.',
       'https://www.michigan.gov/mvaa', '800-642-4838',
       'veterans', 'job_seeker', 'us', 'mi', 'approved'),
      ('UIA — Resources for Employers (Michigan)',
       'Register an employer account, file wage reports, and respond to claims through MiWAM. Call the employer help line for support.',
       'https://www.michigan.gov/leo/bureaus-agencies/uia/employers', '855-484-2636',
       'employer_services', 'employer', 'us', 'mi', 'approved'),
      ('Michigan 2-1-1',
       'Free, confidential referral line to local food, housing, utility, and crisis resources across Michigan. Dial 2-1-1.',
       'https://www.mi211.org', '211',
       'financial_assistance', 'both', 'us', 'mi', 'approved');
  END IF;
END $$;
