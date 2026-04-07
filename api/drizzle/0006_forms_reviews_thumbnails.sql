-- Gap #140 (in-video lead forms), #145 (review comments), #142 (AI thumbnails)

-- ─── #140 In-video lead forms ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_video_forms (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL,
  project_id           TEXT NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  position_seconds     REAL NOT NULL,
  fields               JSONB NOT NULL,
  require_to_continue  BOOLEAN NOT NULL DEFAULT TRUE,
  redirect_url         TEXT,
  submit_button_text   TEXT NOT NULL DEFAULT 'Continue',
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_video_forms_project ON studio_video_forms(project_id);
CREATE INDEX IF NOT EXISTS idx_studio_video_forms_user ON studio_video_forms(user_id);

CREATE TABLE IF NOT EXISTS studio_video_form_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  video_id      TEXT,
  viewer_email  TEXT,
  viewer_name   TEXT,
  answers       JSONB NOT NULL,
  timestamp_sec REAL,
  referrer      TEXT,
  ip_country    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_form_subs_form ON studio_video_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_video_form_subs_project ON studio_video_form_submissions(project_id);

-- ─── #145 Review comments + share links ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_review_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      TEXT NOT NULL,
  parent_id       TEXT,
  author_user_id  TEXT,
  author_name     TEXT NOT NULL,
  author_email    TEXT,
  body            TEXT NOT NULL,
  timestamp_sec   REAL,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_review_comments_project ON studio_review_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_parent ON studio_review_comments(parent_id);

CREATE TABLE IF NOT EXISTS studio_review_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  share_token TEXT NOT NULL UNIQUE,
  name        TEXT,
  expires_at  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_review_links_project ON studio_review_links(project_id);
CREATE INDEX IF NOT EXISTS idx_review_links_token ON studio_review_links(share_token);

-- ─── #142 AI thumbnails ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_thumbnails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  image_url       TEXT NOT NULL,
  storage_key     TEXT,
  source_time_sec REAL,
  headline_text   TEXT,
  score           REAL,
  is_selected     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_thumbnails_project ON studio_thumbnails(project_id);
