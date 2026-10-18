/**
 * Single source of truth for professional feed reactions.
 *
 * A plain "heart/like" reads as casual social-media engagement; a
 * professional network needs a richer, work-appropriate vocabulary
 * (LinkedIn-style: Like / Celebrate / Support / Insightful / Curious /
 * Funny). This module is the ONE place the reaction set is defined so the
 * backend (validation + DTO summaries), the frontend (the reaction picker,
 * post + comment cards), and analytics (trending weights) can't drift.
 *
 * Both post and comment reactions (`reactions.reaction_type`, subject
 * 'feed_post' / 'comment' — shared/engagement-subjects.ts) use this exact set — the picker
 * is reused across both surfaces, so the reaction vocabulary must be too.
 *
 * Emojis are intentionally used (not icon imports) so the same definition
 * is renderable on the server (notification copy) and the client without a
 * font/icon dependency.
 */

export interface ReactionDef {
  /** Stable id persisted in the DB and sent over the wire. */
  type: string;
  /** Display glyph. */
  emoji: string;
  /** Human label (English seed; UI localises via `feed.reaction.<type>`). */
  label: string;
  /** Tailwind text-colour class for the active/selected state. */
  colorClass: string;
  /** Engagement weight used by trending ranking — stronger signals
   *  (Celebrate / Support / Insightful) count for slightly more than a
   *  plain Like, the same way a thoughtful reaction means more than a tap. */
  weight: number;
}

/**
 * The professional reaction set, in display order. `like` MUST stay first —
 * it is the default reaction for a quick tap and the migration backfill
 * value for every pre-existing heart/like row.
 */
export const FEED_REACTIONS: readonly ReactionDef[] = [
  { type: "like",       emoji: "👍", label: "Like",       colorClass: "text-blue-600",   weight: 1 },
  { type: "celebrate",  emoji: "🎉", label: "Celebrate",  colorClass: "text-green-600",  weight: 1.5 },
  { type: "support",    emoji: "🤝", label: "Support",    colorClass: "text-purple-600", weight: 1.5 },
  { type: "insightful", emoji: "💡", label: "Insightful", colorClass: "text-amber-600",  weight: 1.5 },
  { type: "curious",    emoji: "🤔", label: "Curious",    colorClass: "text-teal-600",   weight: 1.2 },
  { type: "funny",      emoji: "😄", label: "Funny",      colorClass: "text-pink-600",   weight: 1 },
] as const;

export const FEED_REACTION_TYPES: readonly string[] = FEED_REACTIONS.map((r) => r.type);

/** Default reaction for a quick tap (and the legacy-like backfill value). */
export const DEFAULT_REACTION = "like";

/** Narrow an unknown value to a valid reaction type. */
export function isValidReaction(value: unknown): value is string {
  return typeof value === "string" && FEED_REACTION_TYPES.includes(value);
}

/** Coerce any input to a valid reaction type, falling back to the default. */
export function normalizeReaction(value: unknown): string {
  return isValidReaction(value) ? (value as string) : DEFAULT_REACTION;
}

/** Look up a reaction definition; always returns a value (default on miss). */
export function reactionDef(type: string | null | undefined): ReactionDef {
  return FEED_REACTIONS.find((r) => r.type === type) ?? FEED_REACTIONS[0];
}

/** One bucket of a reaction rollup. */
export interface ReactionCount {
  type: string;
  count: number;
}

/**
 * Roll a flat list of reaction rows into a count-per-type summary, sorted by
 * the canonical display order (so the most "prominent" reactions lead) and
 * dropping zero buckets. Shared by the post + comment DTO builders so the
 * wire shape is identical on both surfaces.
 */
export function summarizeReactions(
  rows: ReadonlyArray<{ reactionType?: string | null }>,
): ReactionCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const t = normalizeReaction(row.reactionType);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return FEED_REACTIONS.map((r) => ({ type: r.type, count: counts.get(r.type) ?? 0 })).filter(
    (b) => b.count > 0,
  );
}

/**
 * Weighted engagement score for a single reaction type bucket — used by the
 * trending-posts ranking. Centralised so the picker, the summary, and the
 * ranking all agree on what a reaction is "worth".
 */
export function reactionWeight(type: string): number {
  return reactionDef(type).weight;
}
