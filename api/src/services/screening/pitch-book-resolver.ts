/**
 * pitch-book-resolver — given a candidate, decide which screening items they
 * ALREADY satisfy from their existing "pitch book" so the portal never asks for
 * something on file. This is the single seam both the request-creation path
 * (pre-mark satisfied items) and any "re-check" path read through, so the two
 * can't drift.
 *
 * What counts as pre-satisfiable (pull-don't-ask):
 *   • resume                → any résumé on file for the candidate user
 *   • predictive_assessment → a COMPLETED run of that exact instrument
 *   • competency_test       → a PASSED attempt of that exact skill test
 *   • references            → ≥ minReferences reference contacts on file
 *
 * What is NEVER pre-satisfied (must happen inside this request's portal):
 *   • contact_info          → confirmation is an explicit per-request action
 *   • video_interview       → job-specific, recorded fresh each time
 *   • tool_run              → recruiter wants the run done for THIS screen
 *   • application_questions → answered fresh per request (legal/EEO answers)
 *
 * Everything here is read-only and candidate-scoped — it resolves the candidate
 * to a user id (by bound id, else by email) and inspects that user's own
 * records. It never reads another candidate's data and never writes.
 */

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import {
  type ScreeningItemType,
  type ScreeningItemConfig,
  assessmentKindFromConfig,
} from "../../../../shared/screening.js";

const {
  users,
  resumeInformation,
  assessmentRuns,
  assessmentAttempts,
  referenceContacts,
} = schema;

export interface PitchBookItem {
  itemType: ScreeningItemType;
  refId: string | null;
  config: ScreeningItemConfig;
}

export interface PitchBookSatisfaction {
  satisfied: boolean;
  /** Pointer to the satisfying artifact, persisted onto result_ref. */
  resultRef?: Record<string, unknown>;
}

const NOT_SATISFIED: PitchBookSatisfaction = { satisfied: false };

/**
 * Resolve the candidate to a user id: prefer the explicitly-bound id, else
 * look the user up by email. Returns null for a candidate with no account yet
 * (an external invite) — in which case nothing is pre-satisfiable.
 */
export async function resolveCandidateUserId(
  db: Db,
  candidateUserId: string | null,
  candidateEmail: string,
): Promise<string | null> {
  if (candidateUserId) return candidateUserId;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, candidateEmail.toLowerCase()))
    .limit(1);
  return row?.id ?? null;
}

/** Has the candidate any résumé on file? Prefer the active one for the pointer. */
async function checkResume(db: Db, userId: string): Promise<PitchBookSatisfaction> {
  const rows = await db
    .select({ id: resumeInformation.id, isActive: resumeInformation.isActive })
    .from(resumeInformation)
    .where(eq(resumeInformation.userId, userId))
    .orderBy(desc(resumeInformation.isActive), desc(resumeInformation.updatedAt))
    .limit(1);
  const row = rows[0];
  return row ? { satisfied: true, resultRef: { resumeId: row.id } } : NOT_SATISFIED;
}

/** Has the candidate completed this exact validated instrument? */
async function checkPredictiveAssessment(
  db: Db,
  userId: string,
  config: ScreeningItemConfig,
): Promise<PitchBookSatisfaction> {
  const kind = assessmentKindFromConfig(config);
  if (!kind) return NOT_SATISFIED;
  const [row] = await db
    .select({ id: assessmentRuns.id, completedAt: assessmentRuns.completedAt })
    .from(assessmentRuns)
    .where(
      and(
        eq(assessmentRuns.userId, userId),
        eq(assessmentRuns.assessmentKind, kind),
        eq(assessmentRuns.status, "completed"),
      ),
    )
    .orderBy(desc(assessmentRuns.completedAt))
    .limit(1);
  return row
    ? { satisfied: true, resultRef: { assessmentRunId: row.id, assessmentKind: kind } }
    : NOT_SATISFIED;
}

/** Has the candidate passed this exact competency test? */
async function checkCompetencyTest(
  db: Db,
  userId: string,
  refId: string | null,
): Promise<PitchBookSatisfaction> {
  if (!refId) return NOT_SATISFIED;
  const [row] = await db
    .select({ id: assessmentAttempts.id })
    .from(assessmentAttempts)
    .where(
      and(
        eq(assessmentAttempts.userId, userId),
        eq(assessmentAttempts.assessmentId, refId),
        eq(assessmentAttempts.passed, true),
      ),
    )
    .orderBy(desc(assessmentAttempts.submittedAt))
    .limit(1);
  return row
    ? { satisfied: true, resultRef: { attemptId: row.id, assessmentId: refId } }
    : NOT_SATISFIED;
}

/** Does the candidate have at least `minReferences` references on file? */
async function checkReferences(
  db: Db,
  userId: string,
  config: ScreeningItemConfig,
): Promise<PitchBookSatisfaction> {
  const min = config.minReferences ?? 2;
  const rows = await db
    .select({ id: referenceContacts.id })
    .from(referenceContacts)
    .where(eq(referenceContacts.ownerUserId, userId));
  return rows.length >= min
    ? { satisfied: true, resultRef: { referenceContactCount: rows.length } }
    : NOT_SATISFIED;
}

/**
 * Decide whether a single item is already satisfied for a resolved candidate
 * user. Items whose type is never pre-satisfiable (or candidates with no
 * account) fall through to NOT_SATISFIED.
 */
export async function checkItemSatisfied(
  db: Db,
  candidateUserId: string | null,
  item: PitchBookItem,
): Promise<PitchBookSatisfaction> {
  if (!candidateUserId) return NOT_SATISFIED;
  switch (item.itemType) {
    case "resume":
      return checkResume(db, candidateUserId);
    case "predictive_assessment":
      return checkPredictiveAssessment(db, candidateUserId, item.config);
    case "competency_test":
      return checkCompetencyTest(db, candidateUserId, item.refId);
    case "references":
      return checkReferences(db, candidateUserId, item.config);
    // Explicitly never pre-satisfied — see module header.
    case "contact_info":
    case "video_interview":
    case "tool_run":
    case "application_questions":
    default:
      return NOT_SATISFIED;
  }
}
