/**
 * Engagement subject registries — the single source of truth for what a
 * polymorphic `comments` / `reactions` row (W3-A, migrations 0581/0582) may
 * point at. The schema builds its `subject_type` / `reaction_type` CHECK
 * constraints from these arrays and the repositories type their arguments
 * with the derived unions, so the DB and the code cannot drift.
 *
 * Adding a value: append it here, then add a migration that replaces the
 * CHECK (drop + re-add NOT VALID) — push compares CHECKs by name only.
 */
import { FEED_REACTIONS } from "./feed-reactions.js";

/** What a comment thread can hang off. `subject_id` is that row's id. */
export const COMMENT_SUBJECT_TYPES = [
  "booking_reservation", // booking_reservations.id — host ↔ booker thread
  "feed_post", //           feed_posts.id — social feed comments
  "review", //              reviews.id — threaded replies under a review
  "studio_project", //      studio_projects.id — time-coded review comments
] as const;
export type CommentSubjectType = (typeof COMMENT_SUBJECT_TYPES)[number];

/** What a reaction can target. `comment` = a `comments.id` (feed comments). */
export const REACTION_SUBJECT_TYPES = ["feed_post", "comment", "article"] as const;
export type ReactionSubjectType = (typeof REACTION_SUBJECT_TYPES)[number];

/** Medium-style article claps — one row per (user, article), `count` = running total. */
export const CLAP_REACTION_TYPE = "clap" as const;

/** Every persisted reaction type: the professional feed set + claps. */
export const REACTION_TYPES = [
  ...FEED_REACTIONS.map((r) => r.type),
  CLAP_REACTION_TYPE,
] as const;

/** `'a', 'b', …` literal list for a CHECK constraint (values are code constants). */
export function sqlInList(values: readonly string[]): string {
  return values.map((v) => `'${v.replaceAll("'", "''")}'`).join(", ");
}
