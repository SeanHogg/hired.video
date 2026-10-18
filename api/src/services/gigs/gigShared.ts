// Shared gig-domain primitives (#101): error type, input shapes, status
// vocabularies, platform-fee rate, and the global read-cache version token.
// Every gig module (projects, bids, work, escrow, disputes) builds on these.

import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { DomainError } from "../../domains/errors.js";

// Milestone states from which a dispute may be opened. 'pending' (not started)
// and the terminal 'released'/'refunded' can't be disputed; 'disputed' is
// already open.
export const DISPUTABLE_MILESTONE_STATUSES = new Set(["in_progress", "submitted", "approved"]);

// Platform fee on released milestone escrow (gap #101).
export const GIG_PLATFORM_FEE_RATE = 0.1;

// Read-through cache wiring. Gig writes are low-volume, so a single global
// version token (bumped on every write) keeps all gig read keys fresh without
// per-entity dependency tracking. The keyspace is unbounded (open-gig list,
// per-user lists), so it rides the version token; the 60s TTL is a backstop.
const GIG_VERSION_KEY = "gigs:version";
export const GIG_TTL_SECONDS = 60;

// ── status vocabularies ──────────────────────────────────────────────────
// Personal-task status (frontend ProductivityItemStatus): ToDo=1, InProgress=3,
// Completed=6. We materialise gig work at ToDo and read completion at 6.
export const TASK_TODO = 1;
export const TASK_COMPLETED_STATUSES = new Set([4, 6]); // Closed | Completed

/** Map a personal-task status → the gig milestone status it implies. The
 *  poster-only states (approved / released) are never set from here. */
export function taskStatusToMilestone(legacyStatus: number): "pending" | "in_progress" | "submitted" {
  if (TASK_COMPLETED_STATUSES.has(legacyStatus)) return "submitted";
  if (legacyStatus === 3) return "in_progress";
  return "pending";
}

export interface GigItemInput {
  title: string;
  description?: string;
  amountCents: number;
}

export interface CreateGigInput {
  title: string;
  description: string;
  requiredSkills?: string[];
  budgetKind?: "fixed" | "hourly";
  budgetMinCents: number;
  budgetMaxCents: number;
  estimatedDurationDays?: number;
  deadline?: string | null;
  items?: GigItemInput[];
}

export interface PlaceBidInput {
  coverLetter: string;
  proposedAmountCents: number;
  proposedDurationDays?: number;
}

type GigErrorCode = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "VALIDATION_ERROR";

const GIG_ERROR_STATUS: Record<GigErrorCode, 400 | 403 | 404 | 409> = {
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

export class GigError extends DomainError {
  declare readonly code: GigErrorCode;
  constructor(code: GigErrorCode, message: string) {
    super(GIG_ERROR_STATUS[code], code, message);
    this.name = "GigError";
  }
}

// ── cache version token ────────────────────────────────────────────────────

/** Current global gig cache version (rotates on every write). */
export async function gigCacheVersion(): Promise<string> {
  return getOrSetCached<string>({
    key: GIG_VERSION_KEY,
    ttlSeconds: 600,
    loader: async () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
  });
}

/** Drop the version token so every cached gig read key becomes unreachable.
 *  Called by every gig write (incl. the escrow-release route handler). */
export function bumpGigVersion(): void {
  invalidateCachedKey(GIG_VERSION_KEY);
}
