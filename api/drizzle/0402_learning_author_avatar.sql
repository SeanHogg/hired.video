-- Migration 0402 — give the platform learning author a brand-mark avatar (gap #1402).
--
-- The platform-owned `learning@hired.video` user (seeded in migration 0131)
-- owns every first-party course in the Built-in Learning Content Library.
-- Its `user_profiles` row was seeded with a slug, headline, and summary but
-- never an `avatar_url`, so it stays NULL and course cards fall back to a
-- generic placeholder gravatar. We bake in the shipped hired.video brand mark
-- so seeded courses present with the platform identity.
--
-- Asset choice:
--   `/pwa-512x512.png` is the canonical hired.video brand mark already shipped
--   in `frontend/public/` (PWA manifest icon in vite.config.ts, and the LOGO_URL
--   brand mark in studio CustomBannerGenerator / EndCapOverlay). A stable
--   relative public path — no R2 upload or /api/og round-trip needed.
--
-- Identification:
--   Same deterministic `md5('learning@hired.video')::uuid` key the 0131 seed
--   used. Resolved via the `users.email` lookup so it survives any future id
--   scheme change.
--
-- Idempotent / safe:
--   • Only fills when avatar_url is currently empty (NULL or ''), so a manual
--     override is never clobbered on re-run.
--   • No-op if the seed user / profile does not exist (subquery yields NULL →
--     zero rows matched).

UPDATE user_profiles
   SET avatar_url = '/pwa-512x512.png',
       updated_at = NOW()
 WHERE user_id = (SELECT id FROM users WHERE email = 'learning@hired.video')
   AND (avatar_url IS NULL OR avatar_url = '');
