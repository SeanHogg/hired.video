-- Migration 0139 — Persist Tiptap (ProseMirror) JSON for text_md lessons
-- (gap #1569).
--
-- Mirrors articles.body_json (#170). Lesson authoring routes through the
-- same ArticleEditor component now; the JSON shape is the editor's source
-- of truth and body_md is the markdown derivation kept alongside for
-- legacy renderers + ATS/SCORM exports. Renderers (CourseLearner) keep
-- reading body_md, so this is purely round-trip storage — no read-path
-- behaviour change. Nullable: legacy text_md lessons stay JSON-less until
-- the creator re-saves through the WYSIWYG editor.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so re-runs are safe.

ALTER TABLE course_lessons
  ADD COLUMN IF NOT EXISTS body_json JSONB;

-- No index — the column is only ever read on the per-lesson edit path,
-- which already loads the full row by id.
