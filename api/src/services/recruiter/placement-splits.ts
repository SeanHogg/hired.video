/**
 * Placement-splits domain helpers (#228). A placement's fee can be split
 * across recruiters / sourcers / managers; the commission engine fans the
 * payout out per split row. Pure (no I/O) so the routes share one validator +
 * one earnings-attribution calc and both are unit-testable.
 *
 * Rule: a placement either has NO splits (the owning recruiter takes the full
 * fee — legacy behaviour) OR a set of splits that sum to exactly 10_000 bps
 * (100%). There is no partial split.
 */

export const PLACEMENT_SPLIT_OWNER_TYPES = ["recruiter", "sourcer", "manager", "other"] as const;
export type PlacementSplitOwnerType = (typeof PLACEMENT_SPLIT_OWNER_TYPES)[number];

export function normalizeOwnerType(v: unknown): PlacementSplitOwnerType {
  return (PLACEMENT_SPLIT_OWNER_TYPES as readonly string[]).includes(v as string)
    ? (v as PlacementSplitOwnerType)
    : "other";
}

export interface SplitInput {
  ownerUserId: string;
  ownerType: string;
  percentBps: number;
}

/**
 * Validate a replace-all split set. An empty set is valid (clears splits →
 * owner takes the full fee). A non-empty set must sum to exactly 10_000 bps,
 * each row in 1..10_000, with a unique ownerUserId per row.
 */
export function validateSplits(splits: SplitInput[]): { ok: boolean; reason?: string } {
  if (splits.length === 0) return { ok: true };
  const seen = new Set<string>();
  let sum = 0;
  for (const s of splits) {
    if (!s.ownerUserId || typeof s.ownerUserId !== "string") {
      return { ok: false, reason: "Each split needs an owner" };
    }
    if (seen.has(s.ownerUserId)) {
      return { ok: false, reason: "Each owner can only appear once in the split" };
    }
    seen.add(s.ownerUserId);
    if (!Number.isInteger(s.percentBps) || s.percentBps < 1 || s.percentBps > 10_000) {
      return { ok: false, reason: "Each split must be between 1% and 100%" };
    }
    sum += s.percentBps;
  }
  if (sum !== 10_000) {
    return { ok: false, reason: `Splits must total 100% (currently ${(sum / 100).toFixed(2)}%)` };
  }
  return { ok: true };
}

export interface SplitShareRow {
  ownerUserId: string;
  percentBps: number;
}

/**
 * The dollar share a given viewer earns from one placement. When the
 * placement has splits, the viewer earns their summed bps share (0 if they
 * aren't on it). When it has none, the owning recruiter earns the full fee.
 * Pure — the route supplies the loaded splits map.
 */
export function recruiterShareForPlacement(args: {
  placementId: string;
  ownerRecruiterId: string;
  commissionAmount: number;
  viewerUserId: string;
  splitsByPlacement: Map<string, SplitShareRow[]>;
}): number {
  const splits = args.splitsByPlacement.get(args.placementId);
  if (splits && splits.length > 0) {
    const mineBps = splits
      .filter((s) => s.ownerUserId === args.viewerUserId)
      .reduce((n, s) => n + s.percentBps, 0);
    return (args.commissionAmount * mineBps) / 10_000;
  }
  return args.ownerRecruiterId === args.viewerUserId ? args.commissionAmount : 0;
}
