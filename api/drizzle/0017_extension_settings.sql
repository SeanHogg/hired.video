-- Migration: 0017_extension_settings
-- Adds a `extension_settings` jsonb column to `account_preferences` so
-- the Chrome extensions (Job Seeker + Recruiter) can persist their
-- per-user preferences server-side. Prior to this, settings lived in
-- chrome.storage.local only — which meant the hired.video /settings
-- page had no way to surface or modify them, and settings were lost on
-- extension reinstall or device switch.
--
-- Shape (see routes/settings.ts extension-preferences handlers):
--   {
--     "jobseeker": {
--       "autoDetect": true,
--       "autoScore": false,
--       "autoTailor": false,
--       "wizardMode": false,
--       "downloadFormat": "pdf"
--     },
--     "recruiter": {
--       "autoDetectJobs": true,
--       "autoDetectProfiles": true,
--       "autoDetectCompanies": true,
--       "autoScore": false
--     }
--   }
--
-- Nullable-by-default via the empty-object default so existing rows
-- keep working — the server merges against a defaults object on read.

ALTER TABLE "account_preferences"
  ADD COLUMN IF NOT EXISTS "extension_settings" jsonb NOT NULL DEFAULT '{}'::jsonb;
