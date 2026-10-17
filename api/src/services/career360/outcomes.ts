/** Career 360 inner-ring outcomes (#421) — funnel aggregate + banded signals. */

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";
import { c360FunnelCacheKey } from "./cache-keys.js";
import {
  openGaps,
  type CareerTargetDoc,
  type Career360Outcomes,
  type OutcomeSegmentId,
  type OutcomeSignal,
} from "../../../../shared/career360-types.js";

const { jobApplications, interviewSessions } = schema;

// ── Inner-ring outcomes (#421) ───────────────────────────────────────────────
//
// The wheel's inner ring tracks OUTCOMES (did applications convert?),
// distinct from the outer ring's readiness gaps. We derive them from the
// seeker's application lifecycle — `job_applications`, the ONE owner of
// applied → interviewing → offered → accepted (W3-D2; `saved_jobs` is the
// bookmark only, `placements` is recruiter-side, not the seeker's offers). Goal-fit is read straight off the active
// target's gap severities. Until a user has enough applications the
// signal stays "unknown" so a sample of one can't paint the ring.

/** Below this many real applications, callback / offer rates are noise. */
const MIN_APPLIED_FOR_SIGNAL = 3;
/** Below this many reached-interview rows, conversion is noise. */
const MIN_INTERVIEWS_FOR_SIGNAL = 2;
/** Band cut-offs per signal (numerator/denominator → good ≥ / moderate ≥,
 *  else poor). Loose industry benchmarks; centralised so tuning is one
 *  edit. */
const CALLBACK_THRESHOLDS = { good: 0.3, moderate: 0.12 } as const;
const INTERVIEW_THRESHOLDS = { good: 0.4, moderate: 0.15 } as const;
const OFFER_THRESHOLDS = { good: 0.12, moderate: 0.04 } as const;
/** Goal-fit is a 0..1 score (1 = no gaps); these are its band cut-offs. */
const GOALFIT_THRESHOLDS = { good: 0.7, moderate: 0.34 } as const;
/** Interview-practice `overallScore` (0..100) bands, used as the
 *  interview-conversion readiness proxy when the real funnel is thin. */
const PRACTICE_READINESS_THRESHOLDS = { good: 75, moderate: 55 } as const;
/** Funnel aggregate TTL. Short because application status changes live
 *  in the jobs domain and don't invalidate this key (see register #421
 *  follow-up); 2 minutes bounds staleness without re-querying per load. */
const OUTCOMES_CACHE_TTL_SECONDS = 120;

/** Statuses that represent a real submitted application (excludes
 *  "tracked" = saved-not-applied and "cancelled" = job pulled). */
const APPLIED_STATUSES = new Set([
  "applied",
  "interviewing",
  "offered",
  "accepted",
  "declined",
  "rejected",
  "withdrawn",
]);
const INTERVIEWED_STATUSES = new Set(["interviewing", "offered", "accepted", "declined"]);
const OFFERED_STATUSES = new Set(["offered", "accepted", "declined"]);

export interface FunnelCounts {
  /** Distinct jobs the seeker actually applied to (`job_applications`,
   *  deduped by jobId). */
  applied: number;
  /** Rows that reached the interview stage or beyond. */
  interviewed: number;
  /** Rows that produced an offer (offered / accepted / declined-by-user). */
  offered: number;
  /** Mean of completed interview-practice `overallScore`s (0..100), or
   *  null when the seeker hasn't finished a practice session. Used as a
   *  readiness proxy for interview-conversion when the real funnel is
   *  too thin to band (#2093). */
  practiceAvg: number | null;
  /** Number of completed practice sessions behind `practiceAvg`. */
  practiceCount: number;
}

/** Read-through cached funnel aggregate. A small, bounded set of queries
 *  per miss (application rows, practice scores) — never
 *  a per-row fan-out. */
export async function loadFunnelCounts(userId: string): Promise<FunnelCounts> {
  return getOrSetIsolateCached<FunnelCounts>({
    key: c360FunnelCacheKey(userId),
    ttlSeconds: OUTCOMES_CACHE_TTL_SECONDS,
    loader: () => computeFunnelCounts(userId),
  });
}

/** Recent-window cap per funnel source read in `computeFunnelCounts`. */
const FUNNEL_ROW_CAP = 1000;

async function computeFunnelCounts(userId: string): Promise<FunnelCounts> {
  const db = getDb();

  // `job_applications` carries the full stage lifecycle. Each read is
  // bounded to the most recent FUNNEL_ROW_CAP rows — the outcome bands are
  // ratios, so a recent window is representative and keeps a power user's
  // years of history out of the Worker.
  const [applicationRows, practiceRows] = await Promise.all([
    db
      .select({ jobId: jobApplications.jobId, status: jobApplications.status })
      .from(jobApplications)
      .where(eq(jobApplications.userId, userId))
      .orderBy(desc(jobApplications.createdAt))
      .limit(FUNNEL_ROW_CAP),
    db
      .select({ score: interviewSessions.overallScore })
      .from(interviewSessions)
      .where(
        and(
          eq(interviewSessions.userId, userId),
          eq(interviewSessions.status, "completed"),
          isNotNull(interviewSessions.overallScore),
        ),
      )
      .orderBy(desc(interviewSessions.createdAt))
      .limit(FUNNEL_ROW_CAP),
  ]);

  const appliedJobIds = new Set<string>();
  let interviewed = 0;
  let offered = 0;
  for (const row of applicationRows) {
    if (INTERVIEWED_STATUSES.has(row.status)) interviewed += 1;
    if (OFFERED_STATUSES.has(row.status)) offered += 1;
    if (APPLIED_STATUSES.has(row.status) && row.jobId) appliedJobIds.add(row.jobId);
  }
  // `applied` floors at `interviewed` so a stray jobId mismatch can never
  // make the denominator smaller than the interviewed numerator.
  const applied = Math.max(appliedJobIds.size, interviewed);

  const practiceScores = practiceRows
    .map((r) => (r.score == null ? NaN : Number.parseFloat(r.score)))
    .filter((n) => Number.isFinite(n));
  const practiceCount = practiceScores.length;
  const practiceAvg =
    practiceCount > 0
      ? practiceScores.reduce((sum, n) => sum + n, 0) / practiceCount
      : null;

  return { applied, interviewed, offered, practiceAvg, practiceCount };
}

/** Build the four inner-ring outcomes. Pure — goal-fit reads the freshly
 *  loaded `doc` (so selecting/refreshing a target updates it without
 *  touching the funnel cache); the three funnel signals read `counts`.
 *  Exported for unit coverage of the banding/floor math. */
export function computeOutcomes(counts: FunnelCounts, doc: CareerTargetDoc | null): Career360Outcomes {
  return [
    funnelSignal(
      "callback-rate",
      counts.interviewed,
      counts.applied,
      CALLBACK_THRESHOLDS,
      MIN_APPLIED_FOR_SIGNAL,
    ),
    interviewConversionSignal(counts),
    funnelSignal(
      "offer-rate",
      counts.offered,
      counts.applied,
      OFFER_THRESHOLDS,
      MIN_APPLIED_FOR_SIGNAL,
    ),
    goalFitSignal(doc),
  ];
}

/** Interview-conversion: offers ÷ interviews when there's a real funnel;
 *  otherwise fall back to interview-practice readiness (#2093) so a seeker
 *  who's been practising sees a signal instead of grey. The practice
 *  fallback reports `rate: null` — it's a readiness proxy, not a measured
 *  conversion rate. */
function interviewConversionSignal(counts: FunnelCounts): OutcomeSignal {
  if (counts.interviewed >= MIN_INTERVIEWS_FOR_SIGNAL) {
    return funnelSignal(
      "interview-conversion",
      counts.offered,
      counts.interviewed,
      INTERVIEW_THRESHOLDS,
      MIN_INTERVIEWS_FOR_SIGNAL,
    );
  }
  if (counts.practiceCount > 0 && counts.practiceAvg != null) {
    const health =
      counts.practiceAvg >= PRACTICE_READINESS_THRESHOLDS.good ? "good"
      : counts.practiceAvg >= PRACTICE_READINESS_THRESHOLDS.moderate ? "moderate"
      : "poor";
    return { id: "interview-conversion", health, rate: null, sampleSize: counts.practiceCount };
  }
  return { id: "interview-conversion", health: "unknown", rate: null, sampleSize: counts.interviewed };
}

function funnelSignal(
  id: OutcomeSegmentId,
  numerator: number,
  denominator: number,
  thresholds: { good: number; moderate: number },
  minDenominator: number,
): OutcomeSignal {
  if (denominator < minDenominator) {
    return { id, health: "unknown", rate: null, sampleSize: denominator };
  }
  const rate = denominator > 0 ? numerator / denominator : 0;
  const health =
    rate >= thresholds.good ? "good" : rate >= thresholds.moderate ? "moderate" : "poor";
  return { id, health, rate, sampleSize: denominator };
}

/** Goal-fit blends the active target's gap severities into a single 0..1
 *  fit score (1 = no high-severity gaps). No active target / no gaps →
 *  "unknown". */
function goalFitSignal(doc: CareerTargetDoc | null): OutcomeSignal {
  // Only OPEN gaps count against goal-fit — resolving a gap should lift
  // the signal, mirroring the outer ring dropping the segment.
  const gaps = doc?.selected ? openGaps(doc.selected) : [];
  if (!doc?.selected || gaps.length === 0) {
    return { id: "goal-fit", health: "unknown", rate: null, sampleSize: gaps.length };
  }
  const weight = { low: 0, medium: 1, high: 2 } as const;
  const meanSeverity =
    gaps.reduce((sum, g) => sum + weight[g.severity], 0) / gaps.length;
  // Invert: more/severe gaps → lower fit. meanSeverity ∈ [0,2] → fit ∈ [0,1].
  const fit = 1 - meanSeverity / 2;
  const health =
    fit >= GOALFIT_THRESHOLDS.good ? "good"
    : fit >= GOALFIT_THRESHOLDS.moderate ? "moderate"
    : "poor";
  return { id: "goal-fit", health, rate: fit, sampleSize: gaps.length };
}
