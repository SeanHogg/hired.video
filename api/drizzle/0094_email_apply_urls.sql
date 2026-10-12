-- 0094 — Per-message multi-job links.
--
-- LinkedIn Job Alerts (and the equivalent Indeed / Wellfound digest
-- formats) ship N distinct job links in one body. The old
-- `external_email_messages.apply_url` column held only the FIRST
-- URL the regex scraper found, so the inbox detail sheet rendered
-- just one Apply button for a digest that promoted five roles.
--
-- New column: `apply_urls` (jsonb array of `{ url, label }` objects).
-- Each anchor in the body with a recognised apply/jobs/careers/ATS
-- URL is captured with its anchor text so the UI can render a
-- labelled "Apply" button per role.
--
-- `apply_url` (scalar) is kept for backwards compatibility — it
-- continues to hold the first URL so dedup + auto-create stay
-- single-job for now. Multi-job auto-create is tracked separately
-- (one alert email shouldn't blast five rows into the user's job
-- board without an explicit opt-in).
--
-- Safe to re-run: column is nullable, no backfill required.

ALTER TABLE external_email_messages
  ADD COLUMN IF NOT EXISTS apply_urls jsonb;
