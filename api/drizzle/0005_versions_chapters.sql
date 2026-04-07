-- Project version history (gap #131) + video chapters (gap #141)

CREATE TABLE IF NOT EXISTS studio_project_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  version_number  INTEGER NOT NULL,
  label           TEXT,
  storyboard      JSONB NOT NULL,
  is_autosave     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_versions_project ON studio_project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_studio_versions_created ON studio_project_versions(created_at);

CREATE TABLE IF NOT EXISTS studio_chapters (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  title          TEXT NOT NULL,
  start_seconds  REAL NOT NULL,
  thumbnail_url  TEXT,
  order_index    INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_chapters_project ON studio_chapters(project_id);
