-- Studio Features Migration
-- Adds all gap-closing tables for the AI video studio

-- 1. TTS Voiceovers
CREATE TABLE IF NOT EXISTS studio_voiceovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  project_id TEXT,
  scene_id TEXT,
  provider TEXT NOT NULL DEFAULT 'elevenlabs',
  voice_id TEXT NOT NULL,
  voice_name TEXT,
  text TEXT NOT NULL,
  audio_url TEXT,
  audio_key TEXT,
  duration_ms INTEGER,
  word_timestamps JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_voiceovers_user ON studio_voiceovers(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_voiceovers_project ON studio_voiceovers(project_id);

-- 2. Voice Clones
CREATE TABLE IF NOT EXISTS studio_voice_clones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Voice',
  provider TEXT NOT NULL DEFAULT 'elevenlabs',
  external_voice_id TEXT,
  sample_audio_url TEXT,
  sample_audio_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_voice_clones_user ON studio_voice_clones(user_id);

-- 3. Captions
CREATE TABLE IF NOT EXISTS studio_captions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  style TEXT NOT NULL DEFAULT 'standard',
  cues JSONB NOT NULL,
  srt_content TEXT,
  vtt_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_captions_project ON studio_captions(project_id);

-- 4. LinkedIn Accounts
CREATE TABLE IF NOT EXISTS linkedin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  linkedin_id TEXT NOT NULL,
  display_name TEXT,
  profile_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_linkedin_accounts_user ON linkedin_accounts(user_id);

-- 5. Webcam Recordings
CREATE TABLE IF NOT EXISTS studio_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  project_id TEXT,
  type TEXT NOT NULL DEFAULT 'webcam',
  audio_url TEXT,
  video_url TEXT,
  video_key TEXT,
  duration_ms INTEGER,
  transcription TEXT,
  word_timestamps JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_recordings_user ON studio_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_recordings_project ON studio_recordings(project_id);

-- 6. Delivery Coaching
CREATE TABLE IF NOT EXISTS studio_delivery_coaching (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  recording_id TEXT NOT NULL,
  project_id TEXT,
  overall_score INTEGER,
  pacing_wpm INTEGER,
  pacing_score INTEGER,
  filler_words JSONB,
  filler_score INTEGER,
  eye_contact_pct REAL,
  eye_contact_score INTEGER,
  energy_score INTEGER,
  clarity_score INTEGER,
  suggestions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_coaching_user ON studio_delivery_coaching(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_coaching_recording ON studio_delivery_coaching(recording_id);

-- 7. ATS Packages
CREATE TABLE IF NOT EXISTS studio_ats_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  video_url TEXT,
  thumbnail_url TEXT,
  candidate_name TEXT NOT NULL,
  headline TEXT,
  text_summary TEXT NOT NULL,
  email_template TEXT,
  linkedin_url TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_ats_user ON studio_ats_packages(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_ats_slug ON studio_ats_packages(slug);

-- 8. Interview Questions
CREATE TABLE IF NOT EXISTS studio_interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  question TEXT NOT NULL,
  framework TEXT,
  tips JSONB,
  industry TEXT,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interview_questions_category ON studio_interview_questions(category);

-- 9. Interview Sessions
CREATE TABLE IF NOT EXISTS studio_interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  recording_id TEXT,
  coaching_id TEXT,
  talking_points JSONB,
  answer TEXT,
  ai_score INTEGER,
  ai_feedback JSONB,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON studio_interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_question ON studio_interview_sessions(question_id);

-- 10. Skills Demonstrations
CREATE TABLE IF NOT EXISTS studio_skills_demos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  recording_id TEXT,
  project_id TEXT,
  skill_name TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  description TEXT,
  project_url TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  duration_ms INTEGER,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_skills_demos_user ON studio_skills_demos(user_id);
CREATE INDEX IF NOT EXISTS idx_skills_demos_skill ON studio_skills_demos(skill_name);

-- 11. Async Interviews
CREATE TABLE IF NOT EXISTS studio_async_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id TEXT NOT NULL,
  candidate_id TEXT,
  candidate_email TEXT,
  job_id TEXT,
  title TEXT NOT NULL,
  instructions TEXT,
  questions JSONB NOT NULL,
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  invite_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_async_interviews_recruiter ON studio_async_interviews(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_async_interviews_candidate ON studio_async_interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_async_interviews_token ON studio_async_interviews(invite_token);

-- 12. Async Responses
CREATE TABLE IF NOT EXISTS studio_async_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  recording_id TEXT,
  video_url TEXT,
  video_key TEXT,
  duration_ms INTEGER,
  transcription TEXT,
  coaching_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_async_responses_interview ON studio_async_responses(interview_id);
CREATE INDEX IF NOT EXISTS idx_async_responses_candidate ON studio_async_responses(candidate_id);

-- 13. Advanced Video Heatmap Analytics
CREATE TABLE IF NOT EXISTS studio_video_heatmap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT NOT NULL,
  viewer_id TEXT,
  viewer_email TEXT,
  viewer_company TEXT,
  seconds_watched JSONB NOT NULL,
  total_watch_time_sec INTEGER NOT NULL DEFAULT 0,
  percent_watched REAL NOT NULL DEFAULT 0,
  drop_off_second INTEGER,
  referrer TEXT,
  user_agent TEXT,
  ip_country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_heatmap_video ON studio_video_heatmap(video_id);
CREATE INDEX IF NOT EXISTS idx_video_heatmap_viewer ON studio_video_heatmap(viewer_id);

-- 14. Studio Brand Kits (from studioadvertising.ts — previously unmigrated)
CREATE TABLE IF NOT EXISTS studio_brand_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Brand',
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#2563eb',
  secondary_color TEXT NOT NULL DEFAULT '#0f172a',
  accent_color TEXT NOT NULL DEFAULT '#14b8a6',
  font_family TEXT NOT NULL DEFAULT 'Inter',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_brand_kits_user ON studio_brand_kits(user_id);

-- 15. Video Analytics (from studioadvertising.ts — previously unmigrated)
CREATE TABLE IF NOT EXISTS video_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT NOT NULL,
  user_id TEXT,
  event TEXT NOT NULL,
  referrer TEXT,
  campaign_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_analytics_video ON video_analytics(video_id);
CREATE INDEX IF NOT EXISTS idx_video_analytics_event ON video_analytics(event);

-- 16. Video Campaigns (from studioadvertising.ts — previously unmigrated)
CREATE TABLE IF NOT EXISTS video_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  video_ids JSONB NOT NULL DEFAULT '[]',
  stats JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_campaigns_user ON video_campaigns(user_id);
