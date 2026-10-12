/**
 * Social-proof contract shared by the API (`GET /api/proof/stats`) and the
 * marketing UI. Figures are REAL counts — never seeded, padded or invented.
 */

export interface MarketingProofStats {
  /** Distinct real people who have built a resume on hired.video. */
  resumeBuilders: number;
}

/** Below this, a count reads as weak proof, so the UI hides it. */
export const PROOF_DISPLAY_FLOOR = 500;

/**
 * Round DOWN to a clean marketing figure (never up — the claim must stay
 * true): 1,234 → 1,200; 12,345 → 12,000; 123,456 → 120,000. Returns null
 * when the count is below the display floor.
 */
export function roundProofFigure(count: number): number | null {
  if (!Number.isFinite(count) || count < PROOF_DISPLAY_FLOOR) return null;
  const magnitude = 10 ** Math.max(2, Math.floor(Math.log10(count)) - 1);
  return Math.floor(count / magnitude) * magnitude;
}
