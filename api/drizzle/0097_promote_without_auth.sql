-- Opt-in flag for content creators / service providers who want their
-- profile reachable to unauthenticated visitors. Without this set, the
-- /people/:slug page still 200s for anonymous callers (the route already
-- runs optionalAuthMiddleware), but the frontend masks the page with the
-- AuthOverlay sign-in prompt. With this set, the overlay is suppressed so
-- the owner can share their profile as a promotion / portfolio link.
--
-- Defaulted to FALSE so existing users keep their current login-wall
-- behaviour; only owners who explicitly toggle the setting open up.
ALTER TABLE privacy_preferences
  ADD COLUMN IF NOT EXISTS promote_without_auth boolean NOT NULL DEFAULT false;
