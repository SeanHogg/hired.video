/**
 * CohortService — the educator↔student group layer (#1887).
 *
 * A cohort (classroom) is owned by an educator (creator) or an employer
 * company. Ownership + every mutation routes through the Studio
 * `canActFor(actor, ownerUserId, ownerCompanyId)` seam — there is no
 * `canManageCohort` boolean threaded through handlers
 * (feedback_extract_on_duplication). Reads of "cohorts I can manage" use
 * the same accessible-workspace expansion the Studio reads use.
 *
 * Membership is an identity-link roster mirroring people_employees:
 *   userId       → native learner (progress tracked)
 *   invitedEmail → pending invite
 *   displayName  → placeholder label
 *
 * Structural mutations (member add/remove, cohort archive) bump the
 * cohort analytics cache version so the roll-up (#1890) recomputes.
 */

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { getDb } from "../../db/index.js";
import { schema } from "../../db/index.js";
import {
  assertCanWrite,
  canActFor,
  listAccessibleWorkspaces,
  WorkspaceForbiddenError,
} from "../studio/workspace.js";
import { invalidateCohortAnalyticsCache } from "./cohort-analytics.js";

type DbHandle = ReturnType<typeof getDb>;

const { learningCohorts, cohortMembers, users } = schema;

export { WorkspaceForbiddenError };

export class CohortNotFoundError extends Error {
  readonly code = "COHORT_NOT_FOUND" as const;
  constructor(message = "Cohort not found.") {
    super(message);
    this.name = "CohortNotFoundError";
  }
}

/** 8-char join code, unambiguous alphabet (no 0/O/1/I/L). */
function generateJoinCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  (globalThis.crypto ?? ({} as Crypto)).getRandomValues?.(bytes);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[(bytes[i] ?? i) % alphabet.length];
  return out;
}

export class CohortService {
  constructor(private readonly db: DbHandle) {}

  // ── Ownership / loading ────────────────────────────────────────────

  /** Load a cohort the actor may manage, or throw. */
  async getManageable(actorUserId: string, cohortId: string) {
    const [cohort] = await this.db
      .select()
      .from(learningCohorts)
      .where(eq(learningCohorts.id, cohortId))
      .limit(1);
    if (!cohort) throw new CohortNotFoundError();
    await assertCanWrite(actorUserId, cohort.ownerUserId, cohort.ownerCompanyId);
    return cohort;
  }

  // ── Create / update / archive ──────────────────────────────────────

  async createCohort(
    actorUserId: string,
    input: { name: string; description?: string | null; companyId?: string | null; withJoinCode?: boolean },
  ) {
    // Company-owned cohort: the actor must belong to the company.
    if (input.companyId) {
      const ok = await canActFor(actorUserId, actorUserId, input.companyId);
      if (!ok) throw new WorkspaceForbiddenError();
    }
    const [created] = await this.db
      .insert(learningCohorts)
      .values({
        ownerUserId: actorUserId,
        ownerCompanyId: input.companyId ?? null,
        name: input.name,
        description: input.description ?? null,
        joinCode: input.withJoinCode === false ? null : generateJoinCode(),
        status: "active",
      } as never)
      .returning();
    return created;
  }

  async updateCohort(
    actorUserId: string,
    cohortId: string,
    patch: { name?: string; description?: string | null; rotateJoinCode?: boolean; status?: "active" | "archived" },
  ) {
    await this.getManageable(actorUserId, cohortId);
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.rotateJoinCode) set.joinCode = generateJoinCode();
    if (patch.status) {
      set.status = patch.status;
      set.archivedAt = patch.status === "archived" ? new Date() : null;
    }
    const [updated] = await this.db
      .update(learningCohorts)
      .set(set as never)
      .where(eq(learningCohorts.id, cohortId))
      .returning();
    invalidateCohortAnalyticsCache(cohortId);
    return updated;
  }

  // ── Listing (manageable + membership) ──────────────────────────────

  /** Every cohort the actor can manage: personally owned OR owned by a
   *  company they belong to. */
  async listManageable(actorUserId: string) {
    const { companyIds } = await listAccessibleWorkspaces(actorUserId);
    const predicates = [eq(learningCohorts.ownerUserId, actorUserId)];
    if (companyIds.length > 0) {
      predicates.push(inArray(learningCohorts.ownerCompanyId, companyIds));
    }
    const where = predicates.length === 1 ? predicates[0] : or(...predicates);
    const cohorts = await this.db
      .select()
      .from(learningCohorts)
      .where(where)
      .orderBy(desc(learningCohorts.createdAt));
    if (cohorts.length === 0) return [];

    // Annotate with member counts in one batched query (avoid N+1).
    const ids = cohorts.map((c) => c.id);
    const counts = await this.db
      .select({ cohortId: cohortMembers.cohortId, n: sql<number>`count(*)::int` })
      .from(cohortMembers)
      .where(and(inArray(cohortMembers.cohortId, ids), eq(cohortMembers.status, "active")))
      .groupBy(cohortMembers.cohortId);
    const byId = new Map(counts.map((r) => [r.cohortId, Number(r.n) || 0]));
    return cohorts.map((c) => ({ ...c, memberCount: byId.get(c.id) ?? 0 }));
  }

  /** Cohorts the actor is enrolled in as a learner (student/co-educator). */
  async listMyMemberships(userId: string) {
    return this.db
      .select({ cohort: learningCohorts, member: cohortMembers })
      .from(cohortMembers)
      .innerJoin(learningCohorts, eq(learningCohorts.id, cohortMembers.cohortId))
      .where(and(eq(cohortMembers.userId, userId), eq(cohortMembers.status, "active")))
      .orderBy(desc(cohortMembers.joinedAt));
  }

  // ── Members ────────────────────────────────────────────────────────

  async listMembers(actorUserId: string, cohortId: string) {
    await this.getManageable(actorUserId, cohortId);
    return this.db
      .select({
        member: cohortMembers,
        userName: users.name,
        userEmail: users.email,
      })
      .from(cohortMembers)
      .leftJoin(users, eq(users.id, cohortMembers.userId))
      .where(and(eq(cohortMembers.cohortId, cohortId), sql`${cohortMembers.status} <> 'removed'`))
      .orderBy(desc(cohortMembers.createdAt));
  }

  /** Add a member by userId, email invite, or placeholder name. Idempotent
   *  per (cohort, user) / (cohort, email) — a removed member is reactivated
   *  rather than duplicated. */
  async addMember(
    actorUserId: string,
    cohortId: string,
    input: { userId?: string | null; invitedEmail?: string | null; displayName?: string | null; role?: "student" | "co_educator" },
  ) {
    await this.getManageable(actorUserId, cohortId);
    const role = input.role ?? "student";

    // Resolve an email to an existing native user when possible so progress
    // tracks immediately instead of waiting for an invite accept.
    let userId = input.userId ?? null;
    if (!userId && input.invitedEmail) {
      const [u] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.invitedEmail.toLowerCase()))
        .limit(1);
      if (u) userId = u.id;
    }

    const status = userId ? "active" : "invited";
    const values = {
      cohortId,
      userId,
      invitedEmail: userId ? null : (input.invitedEmail ?? null),
      displayName: input.displayName ?? null,
      role,
      status,
      joinedAt: userId ? new Date() : null,
    };

    // Reactivate an existing (cohort,user) or (cohort,email) row if present.
    const dupWhere = userId
      ? and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId))
      : and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.invitedEmail, input.invitedEmail!.toLowerCase()));
    const [existing] = await this.db
      .select({ id: cohortMembers.id })
      .from(cohortMembers)
      .where(dupWhere)
      .limit(1);

    let row;
    if (existing) {
      [row] = await this.db
        .update(cohortMembers)
        .set({ ...values, updatedAt: new Date() } as never)
        .where(eq(cohortMembers.id, existing.id))
        .returning();
    } else {
      [row] = await this.db.insert(cohortMembers).values(values as never).returning();
    }
    invalidateCohortAnalyticsCache(cohortId);
    return row;
  }

  async removeMember(actorUserId: string, cohortId: string, memberId: string) {
    await this.getManageable(actorUserId, cohortId);
    const [row] = await this.db
      .update(cohortMembers)
      .set({ status: "removed", updatedAt: new Date() } as never)
      .where(and(eq(cohortMembers.id, memberId), eq(cohortMembers.cohortId, cohortId)))
      .returning({ id: cohortMembers.id });
    invalidateCohortAnalyticsCache(cohortId);
    return Boolean(row);
  }

  // ── Self-service join by code ──────────────────────────────────────

  /** A learner joins a cohort by typing its join code. Idempotent —
   *  re-joining an active membership is a no-op. Returns the cohort + the
   *  (created or existing) membership row. */
  async joinByCode(userId: string, joinCode: string) {
    const code = joinCode.trim().toUpperCase();
    const [cohort] = await this.db
      .select()
      .from(learningCohorts)
      .where(and(eq(learningCohorts.joinCode, code), eq(learningCohorts.status, "active")))
      .limit(1);
    if (!cohort) throw new CohortNotFoundError("No active cohort matches that join code.");

    const [existing] = await this.db
      .select()
      .from(cohortMembers)
      .where(and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.userId, userId)))
      .limit(1);
    if (existing && existing.status === "active") return { cohort, member: existing };

    let member;
    if (existing) {
      [member] = await this.db
        .update(cohortMembers)
        .set({ status: "active", joinedAt: new Date(), updatedAt: new Date() } as never)
        .where(eq(cohortMembers.id, existing.id))
        .returning();
    } else {
      [member] = await this.db
        .insert(cohortMembers)
        .values({ cohortId: cohort.id, userId, role: "student", status: "active", joinedAt: new Date() } as never)
        .returning();
    }
    invalidateCohortAnalyticsCache(cohort.id);
    return { cohort, member };
  }

  /** Active member userIds for fan-out (assignment enrollment). */
  async activeMemberUserIds(cohortId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: cohortMembers.userId })
      .from(cohortMembers)
      .where(and(
        eq(cohortMembers.cohortId, cohortId),
        eq(cohortMembers.status, "active"),
        sql`${cohortMembers.userId} IS NOT NULL`,
      ));
    return rows.map((r) => r.userId).filter((id): id is string => Boolean(id));
  }
}
