-- Migration 0503 — Video personalization (gap #2350, Moments board).
--
-- What a person sets once in Settings › Video personalization so every
-- video they make uses it: their own words (read in the Who I am scene), up
-- to three interests, personal moments that pick the theme (birthday,
-- wedding or anniversary, a date kept in memory, being a parent, the work
-- anniversary and a recent graduation from the résumé), and whether the
-- theme follows the date or stays fixed.
--
-- One row per user (absent row = the defaults). Private dates change the
-- theme only and are never shown; the theme picker reads them in the
-- person's own browser (shared/theme-calendar/person.ts). Single writer:
-- services/video-personalization.
--
-- Idempotent: IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS user_video_personalization (
  user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  own_words             text NOT NULL DEFAULT '' CHECK (char_length(own_words) <= 200),
  interests             text[] NOT NULL DEFAULT ARRAY[]::text[]
                        CHECK (coalesce(array_length(interests, 1), 0) <= 3),
  birthday_month        smallint CHECK (birthday_month BETWEEN 1 AND 12),
  birthday_day          smallint CHECK (birthday_day BETWEEN 1 AND 31),
  wedding_month         smallint CHECK (wedding_month BETWEEN 1 AND 12),
  wedding_day           smallint CHECK (wedding_day BETWEEN 1 AND 31),
  memory_month          smallint CHECK (memory_month BETWEEN 1 AND 12),
  memory_day            smallint CHECK (memory_day BETWEEN 1 AND 31),
  is_parent             boolean NOT NULL DEFAULT false,
  use_work_anniversary  boolean NOT NULL DEFAULT true,
  use_graduation        boolean NOT NULL DEFAULT true,
  theme_mode            varchar(8) NOT NULL DEFAULT 'byDate' CHECK (theme_mode IN ('byDate','fixed')),
  fixed_theme_id        varchar(32),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (theme_mode = 'byDate' OR fixed_theme_id IS NOT NULL)
);
