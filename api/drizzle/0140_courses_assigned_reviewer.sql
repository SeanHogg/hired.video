-- #1502 — Named-reviewer assignment for courses.
--
-- The review workflow already exists (status='in_review', shared review
-- threads via studio_review_comments). What's missing is a column on
-- courses that names *which* reviewer owns the queue entry, so the
-- reviewer queue page can filter `WHERE assigned_reviewer_id = me`.
--
-- ON DELETE SET NULL — when the reviewer's account is removed we keep
-- the course unblocked rather than orphaning the row.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id uuid
  REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_courses_assigned_reviewer
  ON courses(assigned_reviewer_id)
  WHERE assigned_reviewer_id IS NOT NULL;
