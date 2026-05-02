// branding-policy.ts — single source of truth for "does this user see
// hired.video branding on their video?". Used by the live preview, the
// post-playback end cap, the corner watermark gate, and the export
// pipeline. All four surfaces must agree, otherwise a Pro user could
// see "no branding" in preview and an outro card in the exported MP4
// (or vice versa). Centralising the rule keeps that promise.

export interface BrandingPolicyInput {
  /** True when the active user is on a paid plan that includes branding removal. */
  isPro: boolean;
  /** True when the user has flipped the "Remove hired.video branding" toggle. */
  removeBrandingFlag: boolean;
}

/**
 * Should hired.video branding (end cap + corner watermark) render for this
 * user? Free users always see branding regardless of the toggle — the
 * toggle is only honoured for Pro. The toggle is intentionally surfaced
 * to free users (disabled, with an upgrade CTA) so the gate is
 * discoverable, but the answer here ignores it.
 */
export function shouldShowBranding(input: BrandingPolicyInput): boolean {
  return !(input.isPro && input.removeBrandingFlag);
}
