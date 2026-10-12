-- Migration 0504 — Hide a public video from the home page (gap #2354).
--
-- Public videos appear on the hired.video home page's "Watch people get
-- seen" wall and in discovery (services/studio/public-video-feed.ts). The
-- owner can keep a video public on their profile and the channels they
-- posted to, yet take it off the home wall: `show_on_home = false`.
-- Single writer: services/studio/home-wall.ts (owner toggle in the Post panel).
--
-- Idempotent: IF NOT EXISTS.

ALTER TABLE videos ADD COLUMN IF NOT EXISTS show_on_home boolean NOT NULL DEFAULT true;
