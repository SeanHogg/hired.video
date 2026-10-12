-- #1594 — Data-model audit, batch 2: unique constraints + idempotency keys.
--
-- Each block here has the same shape:
--   1. Pre-flight dedup query that collapses existing duplicates onto the
--      lowest-id row (we keep the oldest write, drop the rest). Idempotent.
--   2. CREATE UNIQUE INDEX IF NOT EXISTS on the now-clean column tuple.
--
-- We use CREATE UNIQUE INDEX (instead of ADD CONSTRAINT … UNIQUE) so that
-- partial-uniqueness with a WHERE clause is available — required for the
-- userConnections case where we want at most one "open" request per pair
-- but historic Rejected rows can coexist.
--
-- Closes:
--   #1597 (userConnections (from_user_id, to_user_id) uniqueness)
--   #1600 (Tremendous vendor_order_id, signalwire SIDs idempotency)
--   #1611 (recruiterListMembers, courseCertificates uniqueness)

-- ---------------------------------------------------------------------------
-- userConnections — at most one OPEN (Pending|Accepted) request per
-- (from_user_id, to_user_id) pair. Rejected requests are excluded from
-- the unique index so a previously-rejected pair can re-request.
-- ---------------------------------------------------------------------------

-- Dedup: when the same pair has multiple Pending/Accepted rows, keep the
-- oldest, hard-delete the rest. Status='Rejected' rows are not touched.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY from_user_id, to_user_id
           ORDER BY created_at, id
         ) AS rn
  FROM user_connections
  WHERE status IN ('Pending', 'Accepted')
)
DELETE FROM user_connections
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_connections_open_pair
  ON user_connections (from_user_id, to_user_id)
  WHERE status IN ('Pending', 'Accepted');

-- ---------------------------------------------------------------------------
-- feed_post_likes — one like per (post, user). Without this, the same
-- user could double-like; the UI dedupes optimistically but the DB
-- doesn't reject the second write.
-- ---------------------------------------------------------------------------

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY feed_post_id, user_id
           ORDER BY created_at, id
         ) AS rn
  FROM feed_post_likes
)
DELETE FROM feed_post_likes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_post_likes_post_user
  ON feed_post_likes (feed_post_id, user_id);

-- ---------------------------------------------------------------------------
-- recruiter_list_members — same candidate should appear at most once
-- per list. position can change but uniqueness is on the membership.
-- ---------------------------------------------------------------------------

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY list_id, talent_pool_candidate_id
           ORDER BY added_at, id
         ) AS rn
  FROM recruiter_list_members
)
DELETE FROM recruiter_list_members
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recruiter_list_members_pair
  ON recruiter_list_members (list_id, talent_pool_candidate_id);

-- ---------------------------------------------------------------------------
-- course_certificates — at most one *active* (non-revoked) cert per
-- enrollment. A revoked cert + re-grant produces a second row with the
-- old row's revoked_at populated; that path must remain legal.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_certificates_active_enrollment
  ON course_certificates (enrollment_id)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- point_redemptions.vendor_order_id — Tremendous order id. A retry of a
-- failed API call after a network blip currently inserts a second
-- redemption row pointing at the same vendor order, double-billing the
-- user. Partial unique because null is valid for ai_credits +
-- premium_month redemptions (they don't go through Tremendous).
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_point_redemptions_vendor_order
  ON point_redemptions (vendor_order_id)
  WHERE vendor_order_id IS NOT NULL;

-- Drop the previous non-unique index — the partial-unique above covers
-- the same lookup query at less storage cost.
DROP INDEX IF EXISTS point_redemptions_vendor_order_idx;

-- ---------------------------------------------------------------------------
-- SignalWire webhook idempotency — re-delivered webhooks for the same
-- callSid / smsSid currently insert duplicate log rows. Partial-unique
-- so legacy rows with NULL signalwire_*_sid (manual entries, tests)
-- aren't disturbed.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_call_logs_signalwire_sid
  ON call_logs (signalwire_call_sid)
  WHERE signalwire_call_sid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_messages_signalwire_sid
  ON sms_messages (signalwire_sms_sid)
  WHERE signalwire_sms_sid IS NOT NULL;
