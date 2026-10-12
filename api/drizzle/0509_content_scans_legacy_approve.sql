-- Migration 0509 — Approve the videos already on the home wall (owner
-- decision 2026-10-10: "just approve the older videos").
--
-- The explicit-content gate (migration 0505) keeps every public video off
-- the home wall until its scan passes. Videos posted before the gate have no
-- verdict (or an unscreened one: their renders have no sampled frames), so
-- they're approved here with a SYSTEM override — no reviewer:
--   subject_type 'video', override_verdict 'pass', reviewed_by NULL (system),
--   reason 'legacy-approved-2026-10-10',
--   input_hash 'legacy:<r2_key>' — a marker the scan recognises
--   (services/moderation/explicit/videoScan.ts): while the video keeps the
--   same render, the approval survives a rescan; a NEW render (new r2_key)
--   goes through the full scan like every new upload.
-- The public feed reads coalesce(override_verdict, verdict) = 'pass', so
-- these rows show immediately. One system audit row (actor NULL) records the
-- batch (AUDIT_ACTIONS.CONTENT_SCAN_LEGACY_APPROVED).
--
-- Legacy = created before the explicit gate existed: the 0505 commit time
-- 2026-10-10T14:27:24Z (a fixed literal, never now(), so a re-run can't
-- approve a video posted after the gate). Both the INSERT selection and the
-- ON CONFLICT update are limited to those videos.
--
-- Idempotent: rows already approved / decided (override set) or with a
-- final verdict (pass / block) are left alone; a re-run inserts nothing new
-- for them and writes no audit row when nothing changed.

WITH approved AS (
  INSERT INTO content_scans (
    subject_type, subject_id, owner_user_id, verdict, categories, reason,
    input_hash, override_verdict, reviewed_by, reviewed_at, scanned_at
  )
  SELECT
    'video', v.id::text, v.user_id, 'unscreened', '{}', 'legacy-approved-2026-10-10',
    'legacy:' || coalesce(v.r2_key, ''), 'pass', NULL, now(), now()
  FROM videos v
  WHERE v.privacy_status = 'public'
    AND v.show_on_home = true
    AND v.created_at < '2026-10-10T14:27:24Z'::timestamptz
  ON CONFLICT (subject_type, subject_id) DO UPDATE
    SET override_verdict = 'pass',
        reason           = 'legacy-approved-2026-10-10',
        input_hash       = EXCLUDED.input_hash,
        reviewed_by      = NULL,
        reviewed_at      = now()
    WHERE content_scans.verdict = 'unscreened'
      AND content_scans.override_verdict IS NULL
      AND EXISTS (
        SELECT 1 FROM videos pre
        WHERE pre.id::text = content_scans.subject_id
          AND pre.created_at < '2026-10-10T14:27:24Z'::timestamptz
      )
  RETURNING subject_id
)
INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, metadata)
SELECT NULL, 'CONTENT_SCAN_LEGACY_APPROVED', 'video', NULL,
       jsonb_build_object('count', count(*), 'reason', 'legacy-approved-2026-10-10', 'migration', '0509')
FROM approved
HAVING count(*) > 0;
