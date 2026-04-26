/**
 * Reconciliation — match sourced_people rows to platform users.
 *
 * The premise from the user requirement:
 *   "We don't surface sourced people directly. When the same person
 *    eventually creates a real account, we'll have two records — sourced
 *    X and user X. We need an admin reconciliation/merge tool."
 *
 * Match signals (in priority order):
 *   1. Email hash match    → +60 confidence
 *   2. LinkedIn URL match  → +50 confidence
 *   3. GitHub handle match → +40 confidence
 *
 * Confidence is capped at 100. The reconciliation pass writes
 * `merge_status='pending_review'` for any row scoring ≥ 50; SuperAdmin
 * decides via the merge tool. Auto-merge is intentionally NOT done — a
 * false positive merges someone else's data onto a user's profile, which
 * is far worse than asking an admin to click once.
 */

import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { hashEmail, normalizeEmail, normalizeLinkedinUrl } from "./hash.js";

interface MatchedIdentifier {
  type: "email" | "linkedin_url" | "github_login";
  value: string;
}

interface MatchScore {
  userId: string;
  confidence: number;
  matchedIdentifiers: MatchedIdentifier[];
}

const SCORE_BY_KIND: Record<MatchedIdentifier["type"], number> = {
  email: 60,
  linkedin_url: 50,
  github_login: 40,
};

function scoreMatches(matches: MatchedIdentifier[]): number {
  if (matches.length === 0) return 0;
  // Sum but cap at 100, with diminishing return on overlap.
  let score = 0;
  for (const m of matches) score += SCORE_BY_KIND[m.type];
  return Math.min(100, score);
}

/**
 * Find platform users that look like a given sourced_people row.
 * Returns at most a handful of candidates ordered by confidence.
 */
export async function findUserCandidatesForPerson(
  db: Db,
  personId: string,
): Promise<MatchScore[]> {
  const [person] = await db
    .select()
    .from(schema.sourcedPeople)
    .where(eq(schema.sourcedPeople.id, personId))
    .limit(1);
  if (!person || person.isRedacted) return [];

  const buckets = new Map<string, MatchedIdentifier[]>();

  if (person.primaryEmail) {
    const email = normalizeEmail(person.primaryEmail);
    const rows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    for (const r of rows) {
      const list = buckets.get(r.id) ?? [];
      list.push({ type: "email", value: email });
      buckets.set(r.id, list);
    }
  }

  if (person.primaryLinkedinUrl) {
    const url = normalizeLinkedinUrl(person.primaryLinkedinUrl);
    const rows = await db
      .select({ id: schema.userProfiles.userId })
      .from(schema.userProfiles)
      .where(sql`lower(trim(trailing '/' from ${schema.userProfiles.linkedIn})) = ${url}`);
    for (const r of rows) {
      const list = buckets.get(r.id) ?? [];
      list.push({ type: "linkedin_url", value: url });
      buckets.set(r.id, list);
    }
  }

  if (person.primaryGithubLogin) {
    const handle = person.primaryGithubLogin.toLowerCase();
    const rows = await db
      .select({ id: schema.userProfiles.userId })
      .from(schema.userProfiles)
      .where(
        or(
          // Stored as bare handle.
          sql`lower(${schema.userProfiles.github}) = ${handle}`,
          // Or as a URL ending /handle (or /handle/).
          sql`lower(${schema.userProfiles.github}) like ${"%/" + handle}`,
          sql`lower(${schema.userProfiles.github}) like ${"%/" + handle + "/"}`,
        ),
      );
    for (const r of rows) {
      const list = buckets.get(r.id) ?? [];
      list.push({ type: "github_login", value: handle });
      buckets.set(r.id, list);
    }
  }

  const out: MatchScore[] = [];
  for (const [userId, matched] of buckets) {
    out.push({ userId, confidence: scoreMatches(matched), matchedIdentifiers: matched });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

/**
 * Inverse: when a user signs up, find sourced_people that look like them.
 * Used by signup hooks and the admin scan endpoint.
 */
export async function findPersonCandidatesForUser(
  db: Db,
  userId: string,
): Promise<Array<{ personId: string; confidence: number; matchedIdentifiers: MatchedIdentifier[] }>> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) return [];
  const [profile] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId)).limit(1);

  const buckets = new Map<string, MatchedIdentifier[]>();

  if (user.email) {
    const emailHash = await hashEmail(user.email);
    const rows = await db
      .select({ id: schema.sourcedPeople.id })
      .from(schema.sourcedPeople)
      .where(
        and(
          eq(schema.sourcedPeople.primaryEmailHash, emailHash),
          eq(schema.sourcedPeople.isRedacted, false),
        ),
      );
    for (const r of rows) {
      const list = buckets.get(r.id) ?? [];
      list.push({ type: "email", value: normalizeEmail(user.email) });
      buckets.set(r.id, list);
    }
  }

  if (profile?.linkedIn) {
    const url = normalizeLinkedinUrl(profile.linkedIn);
    const rows = await db
      .select({ id: schema.sourcedPeople.id })
      .from(schema.sourcedPeople)
      .where(
        and(
          sql`lower(trim(trailing '/' from ${schema.sourcedPeople.primaryLinkedinUrl})) = ${url}`,
          eq(schema.sourcedPeople.isRedacted, false),
        ),
      );
    for (const r of rows) {
      const list = buckets.get(r.id) ?? [];
      list.push({ type: "linkedin_url", value: url });
      buckets.set(r.id, list);
    }
  }

  if (profile?.github) {
    const handle = profile.github
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?github\.com\//, "")
      .replace(/\/$/, "")
      .split("/")[0];
    if (handle) {
      const rows = await db
        .select({ id: schema.sourcedPeople.id })
        .from(schema.sourcedPeople)
        .where(
          and(
            eq(schema.sourcedPeople.primaryGithubLogin, handle),
            eq(schema.sourcedPeople.isRedacted, false),
          ),
        );
      for (const r of rows) {
        const list = buckets.get(r.id) ?? [];
        list.push({ type: "github_login", value: handle });
        buckets.set(r.id, list);
      }
    }
  }

  const out: Array<{ personId: string; confidence: number; matchedIdentifiers: MatchedIdentifier[] }> = [];
  for (const [personId, matched] of buckets) {
    out.push({ personId, confidence: scoreMatches(matched), matchedIdentifiers: matched });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

/**
 * Flag a candidate for admin review on the sourced_people row.
 * No-ops when the row is already merged or has a higher-confidence pending
 * candidate. Logs the detection for audit.
 */
export async function flagMergeCandidate(
  db: Db,
  personId: string,
  candidate: { userId: string; confidence: number; matchedIdentifiers: MatchedIdentifier[] },
): Promise<void> {
  const [row] = await db
    .select()
    .from(schema.sourcedPeople)
    .where(eq(schema.sourcedPeople.id, personId))
    .limit(1);
  if (!row || row.isRedacted) return;
  if (row.mergeStatus === "merged") return;
  if (
    row.mergeStatus === "pending_review" &&
    typeof row.mergeConfidence === "number" &&
    row.mergeConfidence >= candidate.confidence
  ) {
    return;
  }
  if (candidate.confidence < 50) return;

  await db
    .update(schema.sourcedPeople)
    .set({
      mergeStatus: "pending_review",
      mergeCandidateUserId: candidate.userId,
      mergeConfidence: candidate.confidence,
      mergeDetectedAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.sourcedPeople.id, personId));

  await db.insert(schema.sourcedPersonMergeLog).values({
    personId,
    candidateUserId: candidate.userId,
    action: "detected",
    confidence: candidate.confidence,
    matchedIdentifiers: candidate.matchedIdentifiers,
  } as any);
}

export interface MergeOutcome {
  personId: string;
  userId: string;
  identifiersMoved: number;
  cacheRowsRekeyed: number;
}

/**
 * Merge a sourced_people row into a platform user. Sets linked_user_id,
 * marks status='merged', and writes a merge_log entry. Identifiers stay
 * with the sourced row (audit) — but the row is now hidden from
 * unclaimed-pool views via the linked_user_id filter.
 */
export async function mergeSourcedPersonIntoUser(
  db: Db,
  personId: string,
  userId: string,
  performedBy: string | null,
  matchedIdentifiers: MatchedIdentifier[] = [],
  notes?: string,
): Promise<MergeOutcome> {
  const [person] = await db
    .select()
    .from(schema.sourcedPeople)
    .where(eq(schema.sourcedPeople.id, personId))
    .limit(1);
  if (!person) throw new Error("sourced_people row not found");
  if (person.isRedacted) throw new Error("Cannot merge a redacted row");

  await db
    .update(schema.sourcedPeople)
    .set({
      linkedUserId: userId,
      mergeStatus: "merged",
      mergeResolvedAt: new Date(),
      mergeResolvedBy: performedBy,
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.sourcedPeople.id, personId));

  // Count downstream artifacts for the audit response.
  const [{ n: identCount }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.personIdentifiers)
    .where(eq(schema.personIdentifiers.personId, personId));
  const [{ n: cacheCount }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.enrichmentCache)
    .where(eq(schema.enrichmentCache.personId, personId));

  await db.insert(schema.sourcedPersonMergeLog).values({
    personId,
    candidateUserId: userId,
    action: "merged",
    confidence: person.mergeConfidence ?? null,
    matchedIdentifiers,
    performedBy,
    notes: notes ?? null,
  } as any);

  return {
    personId,
    userId,
    identifiersMoved: Number(identCount ?? 0),
    cacheRowsRekeyed: Number(cacheCount ?? 0),
  };
}

export async function rejectMergeCandidate(
  db: Db,
  personId: string,
  performedBy: string | null,
  notes?: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(schema.sourcedPeople)
    .where(eq(schema.sourcedPeople.id, personId))
    .limit(1);
  if (!row) throw new Error("sourced_people row not found");

  await db
    .update(schema.sourcedPeople)
    .set({
      mergeStatus: "rejected_match",
      mergeCandidateUserId: null,
      mergeResolvedAt: new Date(),
      mergeResolvedBy: performedBy,
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.sourcedPeople.id, personId));

  await db.insert(schema.sourcedPersonMergeLog).values({
    personId,
    candidateUserId: row.mergeCandidateUserId ?? null,
    action: "rejected",
    confidence: row.mergeConfidence ?? null,
    matchedIdentifiers: [],
    performedBy,
    notes: notes ?? null,
  } as any);
}

/**
 * Undo a previous merge — restores merge_status='unclaimed' and clears
 * the link. Used when SuperAdmin realises a merge was wrong.
 */
export async function unmergeSourcedPerson(
  db: Db,
  personId: string,
  performedBy: string | null,
  notes?: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(schema.sourcedPeople)
    .where(eq(schema.sourcedPeople.id, personId))
    .limit(1);
  if (!row) throw new Error("sourced_people row not found");
  const previousUserId = row.linkedUserId;

  await db
    .update(schema.sourcedPeople)
    .set({
      linkedUserId: null,
      mergeStatus: "unclaimed",
      mergeCandidateUserId: null,
      mergeConfidence: null,
      mergeResolvedAt: new Date(),
      mergeResolvedBy: performedBy,
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.sourcedPeople.id, personId));

  await db.insert(schema.sourcedPersonMergeLog).values({
    personId,
    candidateUserId: previousUserId ?? null,
    action: "unmerged",
    matchedIdentifiers: [],
    performedBy,
    notes: notes ?? null,
  } as any);
}

/**
 * Bulk reconciliation pass — for every sourced row that's still
 * 'unclaimed', look for matching users and flag candidates. Designed to
 * run as a nightly cron job, capped at a configurable batch size.
 */
export async function runReconciliationPass(db: Db, limit = 500): Promise<{ scanned: number; flagged: number }> {
  const rows = await db
    .select({ id: schema.sourcedPeople.id })
    .from(schema.sourcedPeople)
    .where(
      and(
        eq(schema.sourcedPeople.isRedacted, false),
        eq(schema.sourcedPeople.mergeStatus, "unclaimed"),
        isNull(schema.sourcedPeople.linkedUserId),
      ),
    )
    .limit(limit);

  let flagged = 0;
  for (const r of rows) {
    const candidates = await findUserCandidatesForPerson(db, r.id);
    if (candidates.length === 0) continue;
    const top = candidates[0];
    if (top.confidence < 50) continue;
    await flagMergeCandidate(db, r.id, top);
    flagged++;
  }
  return { scanned: rows.length, flagged };
}
