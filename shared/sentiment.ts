/**
 * Shared sentiment scoring — single source of truth for every endpoint
 * that returns a sentiment score.
 *
 * Imported by:
 *   • api/src/routes/sentiment.ts                         (raw-text route)
 *   • api/src/services/resume/ResumeService.ts            (resume route)
 *   • api/src/services/__tests__/tools-api.test.ts        (route test)
 *   • api/src/services/__tests__/resume-handlers.test.ts  (handler test)
 *
 * Lived in two copies before, with diverging ladders (55/70/85 vs
 * 52/64/78) — same resume scored differently depending on which path the
 * frontend took. Consolidated 2026-05-04.
 */
export const SENTIMENT_BUCKETS = {
  long: { minLength: 300, score: 85 },
  medium: { minLength: 120, score: 70 },
  short: { score: 55 },
} as const;

export function scoreSentiment(text: string): number {
  if (text.length > SENTIMENT_BUCKETS.long.minLength) return SENTIMENT_BUCKETS.long.score;
  if (text.length > SENTIMENT_BUCKETS.medium.minLength) return SENTIMENT_BUCKETS.medium.score;
  return SENTIMENT_BUCKETS.short.score;
}
