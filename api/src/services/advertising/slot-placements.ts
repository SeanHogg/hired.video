/**
 * #2396 — Map a named page slot (InternalAdSlot / AdSlot) to ad-set
 * placementType values that may fill it.
 */

export const SLOT_PLACEMENTS: Record<string, readonly string[]> = {
  "dashboard-banner": ["search_top", "both"],
  "jobs-banner": ["search_top", "both"],
  "jobs-sidebar": ["discovery_feed", "both"],
  "profile-sidebar": ["discovery_feed", "both"],
};

export function placementsForSlot(slot: string): readonly string[] {
  return SLOT_PLACEMENTS[slot] ?? ["search_top", "discovery_feed", "both"];
}
