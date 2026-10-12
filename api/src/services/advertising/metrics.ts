/** Ad performance ratios shared by every advertising read (route stats,
 *  boost lists, ad lists). */

/** Click-through rate as a percentage with two decimals (0 when no impressions). */
export function ctr(impressions: number, clicks: number): number {
  return impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
}

/** Cost per click in dollars, or null when there are no clicks. */
export function costPerClick(spentCents: number, clicks: number): number | null {
  return clicks > 0 ? Math.round(spentCents / clicks) / 100 : null;
}
