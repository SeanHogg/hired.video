-- 0592_user_settings.sql
--
-- W3-B (architecture remediation 2026-10-17): one settings row per user.
-- account_preferences, privacy_preferences and cookie_preferences (all 1:1
-- with users) become the account / privacy / cookie sections of
-- user_settings, column for column (cookie columns gain a `cookie_` prefix).
--
-- Each section has a `*_saved_at` marker = the old row's updated_at, NULL
-- when the user had no row in that table. Readers treat a NULL marker as the
-- old "no row" (repositories/preferencesRepository.ts), so code-side
-- defaults keep applying exactly as before. Idempotent: ON CONFLICT
-- (user_id) DO NOTHING. The old tables are archived by 0595 after a final
-- catch-up of rows changed between this migration and the new Worker.

CREATE TABLE IF NOT EXISTS user_settings (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_notifications_enabled   boolean NOT NULL DEFAULT true,
  job_alert_emails_enabled      boolean NOT NULL DEFAULT true,
  weekly_digest_enabled         boolean NOT NULL DEFAULT true,
  notification_preferences      jsonb,
  theme                         varchar(50) NOT NULL DEFAULT 'light',
  language                      varchar(10) NOT NULL DEFAULT 'en',
  timezone                      varchar(100) NOT NULL DEFAULT 'UTC',
  currency                      varchar(10) NOT NULL DEFAULT 'USD',
  extension_settings            jsonb NOT NULL DEFAULT '{}'::jsonb,
  account_saved_at              timestamptz,
  profile_visible_to_public     boolean NOT NULL DEFAULT true,
  profile_visible_to_recruiters boolean NOT NULL DEFAULT true,
  allow_search_engine_indexing  boolean NOT NULL DEFAULT true,
  show_activity_status          boolean NOT NULL DEFAULT true,
  show_connections_list         boolean NOT NULL DEFAULT true,
  allow_direct_messages         boolean NOT NULL DEFAULT true,
  allow_connection_requests     boolean NOT NULL DEFAULT true,
  show_email                    boolean NOT NULL DEFAULT false,
  show_phone                    boolean NOT NULL DEFAULT false,
  show_location                 boolean NOT NULL DEFAULT false,
  promote_without_auth          boolean NOT NULL DEFAULT false,
  allow_messaging               boolean NOT NULL DEFAULT true,
  share_analytics_data          boolean NOT NULL DEFAULT true,
  share_usage_data              boolean NOT NULL DEFAULT true,
  allow_data_export             boolean NOT NULL DEFAULT true,
  privacy_saved_at              timestamptz,
  cookie_analytics              boolean NOT NULL DEFAULT false,
  cookie_marketing              boolean NOT NULL DEFAULT false,
  cookie_personalization        boolean NOT NULL DEFAULT false,
  cookie_consented_at           timestamptz,
  cookies_saved_at              timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_user_id_unique') THEN
    ALTER TABLE user_settings ADD CONSTRAINT user_settings_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

INSERT INTO user_settings (
  id, user_id,
  email_notifications_enabled, job_alert_emails_enabled, weekly_digest_enabled, notification_preferences,
  theme, language, timezone, currency, extension_settings, account_saved_at,
  profile_visible_to_public, profile_visible_to_recruiters, allow_search_engine_indexing, show_activity_status,
  show_connections_list, allow_direct_messages, allow_connection_requests, show_email, show_phone, show_location,
  promote_without_auth, allow_messaging, share_analytics_data, share_usage_data, allow_data_export, privacy_saved_at,
  cookie_analytics, cookie_marketing, cookie_personalization, cookie_consented_at, cookies_saved_at,
  created_at, updated_at
)
SELECT
  COALESCE(ap.id, pp.id, cp.id),
  u.user_id,
  COALESCE(ap.email_notifications_enabled, true),
  COALESCE(ap.job_alert_emails_enabled, true),
  COALESCE(ap.weekly_digest_enabled, true),
  ap.notification_preferences,
  COALESCE(ap.theme, 'light'),
  COALESCE(ap.language, 'en'),
  COALESCE(ap.timezone, 'UTC'),
  COALESCE(ap.currency, 'USD'),
  COALESCE(ap.extension_settings, '{}'::jsonb),
  CASE WHEN ap.id IS NOT NULL THEN ap.updated_at END,
  COALESCE(pp.profile_visible_to_public, true),
  COALESCE(pp.profile_visible_to_recruiters, true),
  COALESCE(pp.allow_search_engine_indexing, true),
  COALESCE(pp.show_activity_status, true),
  COALESCE(pp.show_connections_list, true),
  COALESCE(pp.allow_direct_messages, true),
  COALESCE(pp.allow_connection_requests, true),
  COALESCE(pp.show_email, false),
  COALESCE(pp.show_phone, false),
  COALESCE(pp.show_location, false),
  COALESCE(pp.promote_without_auth, false),
  COALESCE(pp.allow_messaging, true),
  COALESCE(pp.share_analytics_data, true),
  COALESCE(pp.share_usage_data, true),
  COALESCE(pp.allow_data_export, true),
  CASE WHEN pp.id IS NOT NULL THEN pp.updated_at END,
  COALESCE(cp.analytics, false),
  COALESCE(cp.marketing, false),
  COALESCE(cp.personalization, false),
  cp.consented_at,
  CASE WHEN cp.id IS NOT NULL THEN cp.updated_at END,
  LEAST(ap.created_at, pp.created_at, cp.created_at),
  GREATEST(ap.updated_at, pp.updated_at, cp.updated_at)
FROM (
  SELECT user_id FROM account_preferences
  UNION
  SELECT user_id FROM privacy_preferences
  UNION
  SELECT user_id FROM cookie_preferences
) AS u
LEFT JOIN account_preferences ap ON ap.user_id = u.user_id
LEFT JOIN privacy_preferences pp ON pp.user_id = u.user_id
LEFT JOIN cookie_preferences cp ON cp.user_id = u.user_id
ON CONFLICT (user_id) DO NOTHING;
