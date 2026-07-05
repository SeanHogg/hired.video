/**
 * ActivityService — paid activities the hire→work→pay loop (migration 0492).
 *
 * An "activity" is a compensated `tasks` row: an employer assigns it to a
 * person they've hired (owner = worker), tags it hourly or fixed, and the
 * worker tracks time (hourly) or just marks it done (fixed). Approval credits
 * the worker through PayoutLedgerService (source_kind='task'), so payout rides
 * the same accrual → ReleaseWorker → Tremendous/Helcim rails as gigs and
 * workforce timesheets. No funded escrow — an accrual-only model (product
 * decision 2026-07-05).
 *
 * Lifecycle (mirrors timesheets): assigned → submitted → approved | rejected.
 *
 * Authority:
 *   - assign / approve / reject: caller must be an active `employer` in the
 *     activity's companyId (resolveEmployerCompanyIds).
 *   - track / submit: caller must OWN the activity (task.userId).
 *
 * Time tracking reuses `task_time_entries` (taskId set, companyId from the
 * activity) so an activity worker never needs a formal `employee` seat. To
 * avoid double-paying a person who is BOTH a workforce employee and an
 * activity worker, the workforce weekly-timesheet aggregation excludes entries
 * pinned to a paid activity — see `isActivityTimeEntryTaskId` + its use in
 * services/workforce/index.ts submitTimesheet.
 */

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { ForbiddenError } from "../../middleware/errorHandler.js";
import { PayoutLedgerService } from "../payout/PayoutLedgerService.js";
import { NotificationService } from "../notifications/notificationService.js";
import { resolveEmployerCompanyIds, getActiveTimeEntry } from "../workforce/index.js";
import { getOrCreateDefaultBoard } from "../productivity/default-board.js";
import {
  computeActivityEarnedCents,
  isActivityPayType,
  type ActivityDTO,
  type ActivityStatus,
  type AssignActivityInput,
  type AssignableWorkerDTO,
} from "../../../../shared/activities.js";

const {
  tasks,
  taskTimeEntries,
  jobPipelineEntries,
  jobItems,
  userCompanyRoleAssociations,
  users,
  companyProfiles,
  placements,
} = schema;

type TaskRow = typeof tasks.$inferSelect;

/** Time-entry statuses whose seconds count toward an activity's tracked time.
 *  'open' rows have no duration yet; 'rejected' entries are excluded. */
const COUNTABLE_ENTRY_STATUSES = ["closed", "submitted", "approved"];

export class ActivityService {
  private ledger = new PayoutLedgerService();

  // ── Reads ────────────────────────────────────────────────────────────────

  /** Activities assigned to a worker (their inbox). Newest first. */
  async listForWorker(workerUserId: string, db = getDb()): Promise<ActivityDTO[]> {
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, workerUserId), sql`${tasks.payType} IS NOT NULL`))
      .orderBy(desc(tasks.createdAt));
    const tracked = await this.trackedSecByTask(rows.map((r) => r.id), db);
    return rows.map((r) => this.toDto(r, tracked.get(r.id) ?? 0));
  }

  /** All paid activities across the employer's companies (their team board). */
  async listForEmployer(employerUserId: string, db = getDb()): Promise<ActivityDTO[]> {
    const companyIds = await resolveEmployerCompanyIds(employerUserId, db);
    if (companyIds.length === 0) return [];
    const rows = await db
      .select({ task: tasks, workerName: users.name })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.userId))
      .where(and(inArray(tasks.companyId, companyIds), sql`${tasks.payType} IS NOT NULL`))
      .orderBy(desc(tasks.createdAt));
    const tracked = await this.trackedSecByTask(rows.map((r) => r.task.id), db);
    return rows.map((r) => this.toDto(r.task, tracked.get(r.task.id) ?? 0, r.workerName ?? undefined));
  }

  /** People an employer may assign to: hired pipeline candidates + existing
   *  workforce employees, deduped by user. Powers the assign dialog picker. */
  async listAssignableWorkers(employerUserId: string, db = getDb()): Promise<AssignableWorkerDTO[]> {
    const companyIds = await resolveEmployerCompanyIds(employerUserId, db);
    // A recruiter may own pipelines without an employer UCRA; fall back to a
    // single implicit company only when they manage one, so hired-candidate
    // assignment still works. When there's no company we can't attribute the
    // activity, so those candidates aren't assignable yet.
    const companyNameById = new Map<string, string>();
    if (companyIds.length > 0) {
      const companies = await db
        .select({ id: companyProfiles.id, name: companyProfiles.name })
        .from(companyProfiles)
        .where(inArray(companyProfiles.id, companyIds));
      for (const c of companies) companyNameById.set(c.id, c.name ?? "");
    }

    const byUser = new Map<string, AssignableWorkerDTO>();

    // Existing active employees in the employer's companies.
    if (companyIds.length > 0) {
      const employees = await db
        .select({
          userId: userCompanyRoleAssociations.userId,
          companyId: userCompanyRoleAssociations.companyId,
          name: users.name,
          email: users.email,
        })
        .from(userCompanyRoleAssociations)
        .innerJoin(users, eq(users.id, userCompanyRoleAssociations.userId))
        .where(
          and(
            eq(userCompanyRoleAssociations.role, "employee"),
            eq(userCompanyRoleAssociations.isActive, true),
            inArray(userCompanyRoleAssociations.companyId, companyIds),
          ),
        );
      for (const e of employees) {
        byUser.set(e.userId, {
          userId: e.userId,
          name: e.name ?? e.email ?? "Worker",
          email: e.email ?? undefined,
          companyId: e.companyId,
          companyName: companyNameById.get(e.companyId) ?? undefined,
          source: "employee",
        });
      }
    }

    // Hired pipeline candidates on jobs the employer posted. We attribute the
    // activity to the job's companyId when present, else the employer's single
    // company. Candidates already captured as employees keep that source.
    const hired = await db
      .select({
        candidateUserId: jobPipelineEntries.candidateUserId,
        candidateName: jobPipelineEntries.candidateName,
        candidateEmail: jobPipelineEntries.candidateEmail,
        jobCompanyId: jobItems.companyId,
      })
      .from(jobPipelineEntries)
      .innerJoin(jobItems, eq(jobItems.id, jobPipelineEntries.jobId))
      .where(
        and(
          eq(jobPipelineEntries.stage, "hired"),
          sql`${jobPipelineEntries.candidateUserId} IS NOT NULL`,
          eq(jobItems.postedByUserId, employerUserId),
        ),
      );
    for (const h of hired) {
      const uid = h.candidateUserId as string;
      if (byUser.has(uid)) continue;
      const companyId =
        (h.jobCompanyId && companyIds.includes(h.jobCompanyId) ? h.jobCompanyId : null) ??
        companyIds[0] ??
        h.jobCompanyId ??
        null;
      if (!companyId) continue; // can't attribute — skip until a company exists
      byUser.set(uid, {
        userId: uid,
        name: h.candidateName || h.candidateEmail || "Candidate",
        email: h.candidateEmail ?? undefined,
        companyId,
        companyName: companyNameById.get(companyId) ?? undefined,
        source: "hired",
      });
    }

    return [...byUser.values()];
  }

  // ── Employer mutations ─────────────────────────────────────────────────────

  async assign(employerUserId: string, input: AssignActivityInput, db = getDb()): Promise<ActivityDTO> {
    if (!isActivityPayType(input.payType)) {
      throw new ForbiddenError("payType must be 'hourly' or 'fixed'");
    }
    if (!input.title || !input.title.trim()) {
      throw new ForbiddenError("An activity needs a title");
    }
    const rateCents = input.payType === "hourly" ? Math.round(input.rateCents ?? 0) : null;
    const amountCents = input.payType === "fixed" ? Math.round(input.amountCents ?? 0) : null;
    if (input.payType === "hourly" && (!rateCents || rateCents <= 0)) {
      throw new ForbiddenError("Hourly activities need a positive rate");
    }
    if (input.payType === "fixed" && (!amountCents || amountCents <= 0)) {
      throw new ForbiddenError("Fixed activities need a positive amount");
    }

    const companyId = await this.resolveCompanyId(employerUserId, input.companyId, db);
    await this.assertCanAssignToWorker(employerUserId, input.workerUserId, companyId, db);

    const boardId = await getOrCreateDefaultBoard(input.workerUserId, db);
    const [row] = await db
      .insert(tasks)
      .values({
        boardId,
        userId: input.workerUserId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        status: "todo",
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        payType: input.payType,
        rateCents,
        amountCents,
        payCurrency: (input.currency || "USD").toUpperCase(),
        assignedByUserId: employerUserId,
        companyId,
        activityStatus: "assigned",
        metadata: { activity: { assignedAt: new Date().toISOString(), assignedByUserId: employerUserId } },
      } as any)
      .returning();
    // Message the hired person that they've been given work to do. Best-effort
    // (in-app notification + pref-gated push); never blocks the assignment.
    void NotificationService.notify({
      userId: input.workerUserId,
      type: "assignment",
      title: `New activity assigned: ${row.title}`,
      message:
        input.payType === "hourly"
          ? "You've been assigned paid hourly work. Track your time and submit it for approval to get paid."
          : "You've been assigned a paid activity. Mark it done and submit it for approval to get paid.",
      url: "/tasks",
      refType: "activity",
      refId: row.id,
    });
    return this.toDto(row, 0);
  }

  async approve(employerUserId: string, taskId: string, db = getDb()): Promise<ActivityDTO> {
    const row = await this.loadForEmployer(employerUserId, taskId, db);
    // Idempotent: an already-approved activity returns as-is (the ledger
    // accrual is also idempotent by (source_kind, source_id)).
    if (row.activityStatus === "approved") {
      return this.toDto(row, await this.trackedSecFor(taskId, db));
    }
    if (row.activityStatus !== "submitted") {
      throw new ForbiddenError(`Cannot approve an activity in state '${row.activityStatus}'`);
    }

    const trackedSec = await this.trackedSecFor(taskId, db);
    const earnedCents = computeActivityEarnedCents({
      payType: row.payType as any,
      rateCents: row.rateCents,
      amountCents: row.amountCents,
      trackedSec,
    });

    let payoutEntryId: string | null = null;
    if (earnedCents > 0) {
      const accrual = await this.ledger.recordAccrual({
        userId: row.userId,
        amountCents: earnedCents,
        currency: row.payCurrency ?? "USD",
        sourceKind: "task",
        sourceId: taskId,
        note: `Activity approved — ${row.title}`,
        db,
      });
      payoutEntryId = accrual.entryId;
    }

    // Lock the time entries that fed the payout.
    const now = new Date();
    await db
      .update(taskTimeEntries)
      .set({ status: "approved", updatedAt: now } as any)
      .where(and(eq(taskTimeEntries.taskId, taskId), inArray(taskTimeEntries.status, COUNTABLE_ENTRY_STATUSES)));

    const [updated] = await db
      .update(tasks)
      .set({
        activityStatus: "approved",
        status: "done",
        completedAt: row.completedAt ?? now,
        metadata: this.mergeActivityMeta(row, {
          approvedAt: now.toISOString(),
          approvedByUserId: employerUserId,
          payoutEntryId,
          earnedCents,
        }),
        updatedAt: now,
      } as any)
      .where(eq(tasks.id, taskId))
      .returning();
    if (earnedCents > 0) {
      const dollars = (earnedCents / 100).toFixed(2);
      void NotificationService.notify({
        userId: row.userId,
        type: "system",
        title: `Activity approved — $${dollars} added to your balance`,
        message: `"${row.title}" was approved. $${dollars} was credited to your payouts balance.`,
        url: "/settings?tab=payouts",
        refType: "activity",
        refId: taskId,
      });
    }
    return this.toDto(updated, trackedSec);
  }

  async reject(employerUserId: string, taskId: string, reason: string, db = getDb()): Promise<ActivityDTO> {
    const row = await this.loadForEmployer(employerUserId, taskId, db);
    if (row.activityStatus !== "submitted") {
      throw new ForbiddenError(`Cannot reject an activity in state '${row.activityStatus}'`);
    }
    const now = new Date();
    // Unlock entries so the worker can log more time / re-submit.
    await db
      .update(taskTimeEntries)
      .set({ status: "closed", updatedAt: now } as any)
      .where(and(eq(taskTimeEntries.taskId, taskId), eq(taskTimeEntries.status, "submitted")));
    const [updated] = await db
      .update(tasks)
      .set({
        activityStatus: "rejected",
        status: "todo",
        completedAt: null,
        metadata: this.mergeActivityMeta(row, { rejectionReason: reason, rejectedAt: now.toISOString() }),
        updatedAt: now,
      } as any)
      .where(eq(tasks.id, taskId))
      .returning();
    void NotificationService.notify({
      userId: row.userId,
      type: "assignment",
      title: `Changes requested on: ${row.title}`,
      message: reason,
      url: "/tasks",
      refType: "activity",
      refId: taskId,
    });
    return this.toDto(updated, await this.trackedSecFor(taskId, db));
  }

  // ── Worker mutations ───────────────────────────────────────────────────────

  /** Start the activity clock. Hourly only; refuses if the worker already has
   *  an open timer anywhere (the one-timer-per-user invariant, shared with
   *  workforce punch-in). */
  async startTimer(workerUserId: string, taskId: string, db = getDb()) {
    const row = await this.loadForWorker(workerUserId, taskId, db);
    if (row.payType !== "hourly") throw new ForbiddenError("Only hourly activities track time");
    if (row.activityStatus === "approved") throw new ForbiddenError("This activity is already approved");
    const active = await getActiveTimeEntry(workerUserId, db);
    if (active) throw new ForbiddenError("You're already tracking time — stop the current timer first");
    if (!row.companyId) throw new ForbiddenError("Activity is missing its company context");
    const [entry] = await db
      .insert(taskTimeEntries)
      .values({
        taskId,
        userId: workerUserId,
        companyId: row.companyId,
        startedAt: new Date(),
        billable: true,
        status: "open",
        notes: row.title,
      } as any)
      .returning();
    return entry;
  }

  /** Stop the open timer for this activity. No-op (null) if none is open. */
  async stopTimer(workerUserId: string, taskId: string, db = getDb()) {
    const active = await getActiveTimeEntry(workerUserId, db);
    if (!active || active.taskId !== taskId) return null;
    const endedAt = new Date();
    const durationSec = Math.max(
      0,
      Math.floor((endedAt.getTime() - new Date(active.startedAt).getTime()) / 1000),
    );
    const [entry] = await db
      .update(taskTimeEntries)
      .set({ endedAt, durationSec, status: "closed", updatedAt: endedAt } as any)
      .where(eq(taskTimeEntries.id, active.id))
      .returning();
    return entry;
  }

  /** Worker marks the activity done → submitted for employer approval. */
  async submit(workerUserId: string, taskId: string, db = getDb()): Promise<ActivityDTO> {
    const row = await this.loadForWorker(workerUserId, taskId, db);
    if (row.activityStatus !== "assigned" && row.activityStatus !== "rejected") {
      throw new ForbiddenError(`Cannot submit an activity in state '${row.activityStatus}'`);
    }
    // Finalise any running timer so its seconds count toward payout.
    const active = await getActiveTimeEntry(workerUserId, db);
    if (active && active.taskId === taskId) {
      await this.stopTimer(workerUserId, taskId, db);
    }
    const now = new Date();
    // Move this activity's countable entries into 'submitted' so the workforce
    // weekly path leaves them alone and approval can lock them.
    await db
      .update(taskTimeEntries)
      .set({ status: "submitted", updatedAt: now } as any)
      .where(and(eq(taskTimeEntries.taskId, taskId), eq(taskTimeEntries.status, "closed")));
    const [updated] = await db
      .update(tasks)
      .set({
        activityStatus: "submitted",
        status: "done",
        completedAt: now,
        metadata: this.mergeActivityMeta(row, { submittedAt: now.toISOString() }),
        updatedAt: now,
      } as any)
      .where(eq(tasks.id, taskId))
      .returning();
    return this.toDto(updated, await this.trackedSecFor(taskId, db));
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async resolveCompanyId(
    employerUserId: string,
    requested: string | undefined,
    db: ReturnType<typeof getDb>,
  ): Promise<string> {
    const companyIds = await resolveEmployerCompanyIds(employerUserId, db);
    if (companyIds.length === 0) {
      throw new ForbiddenError("You must manage a company to assign activities");
    }
    if (requested) {
      if (!companyIds.includes(requested)) throw new ForbiddenError("Not an employer in that company");
      return requested;
    }
    if (companyIds.length === 1) return companyIds[0];
    throw new ForbiddenError("Specify which company this activity is for");
  }

  private async assertCanAssignToWorker(
    employerUserId: string,
    workerUserId: string,
    companyId: string,
    db: ReturnType<typeof getDb>,
  ): Promise<void> {
    // (a) already an active employee in this company
    const [emp] = await db
      .select({ id: userCompanyRoleAssociations.id })
      .from(userCompanyRoleAssociations)
      .where(
        and(
          eq(userCompanyRoleAssociations.userId, workerUserId),
          eq(userCompanyRoleAssociations.companyId, companyId),
          eq(userCompanyRoleAssociations.role, "employee"),
          eq(userCompanyRoleAssociations.isActive, true),
        ),
      )
      .limit(1);
    if (emp) return;
    // (b) a hired candidate on a job the employer posted. Two-step (no join):
    // find the employer's job ids, then look for a 'hired' pipeline entry for
    // this worker on one of them.
    const employerJobs = await db
      .select({ id: jobItems.id })
      .from(jobItems)
      .where(eq(jobItems.postedByUserId, employerUserId));
    const jobIds = employerJobs.map((j) => j.id);
    if (jobIds.length > 0) {
      const [hired] = await db
        .select({ id: jobPipelineEntries.id })
        .from(jobPipelineEntries)
        .where(
          and(
            eq(jobPipelineEntries.candidateUserId, workerUserId),
            eq(jobPipelineEntries.stage, "hired"),
            inArray(jobPipelineEntries.jobId, jobIds),
          ),
        )
        .limit(1);
      if (hired) return;
    }
    // (c) the worker is the placed candidate on an active placement the caller
    // recruits for, or that belongs to this company.
    const [placed] = await db
      .select({ id: placements.id })
      .from(placements)
      .where(
        and(
          eq(placements.candidateId, workerUserId),
          sql`${placements.status} NOT IN ('cancelled', 'ended', 'terminated')`,
          sql`(${placements.recruiterId} = ${employerUserId} OR ${placements.companyId} = ${companyId})`,
        ),
      )
      .limit(1);
    if (placed) return;
    throw new ForbiddenError("You can only assign activities to people you've hired or employ");
  }

  private async loadForEmployer(
    employerUserId: string,
    taskId: string,
    db: ReturnType<typeof getDb>,
  ): Promise<TaskRow> {
    const [row] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), sql`${tasks.payType} IS NOT NULL`))
      .limit(1);
    if (!row) throw new ForbiddenError("Activity not found");
    const companyIds = await resolveEmployerCompanyIds(employerUserId, db);
    if (!row.companyId || !companyIds.includes(row.companyId)) {
      throw new ForbiddenError("Not authorised to manage this activity");
    }
    return row;
  }

  private async loadForWorker(
    workerUserId: string,
    taskId: string,
    db: ReturnType<typeof getDb>,
  ): Promise<TaskRow> {
    const [row] = await db
      .select()
      .from(tasks)
      .where(
        and(eq(tasks.id, taskId), eq(tasks.userId, workerUserId), sql`${tasks.payType} IS NOT NULL`),
      )
      .limit(1);
    if (!row) throw new ForbiddenError("Activity not found");
    return row;
  }

  private async trackedSecFor(taskId: string, db: ReturnType<typeof getDb>): Promise<number> {
    const [r] = await db
      .select({ total: sql<number>`COALESCE(SUM(${taskTimeEntries.durationSec}), 0)::int` })
      .from(taskTimeEntries)
      .where(
        and(eq(taskTimeEntries.taskId, taskId), inArray(taskTimeEntries.status, COUNTABLE_ENTRY_STATUSES)),
      );
    return Number(r?.total ?? 0);
  }

  private async trackedSecByTask(
    taskIds: string[],
    db: ReturnType<typeof getDb>,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (taskIds.length === 0) return out;
    const rows = await db
      .select({
        taskId: taskTimeEntries.taskId,
        total: sql<number>`COALESCE(SUM(${taskTimeEntries.durationSec}), 0)::int`,
      })
      .from(taskTimeEntries)
      .where(
        and(
          inArray(taskTimeEntries.taskId, taskIds),
          inArray(taskTimeEntries.status, COUNTABLE_ENTRY_STATUSES),
        ),
      )
      .groupBy(taskTimeEntries.taskId);
    for (const r of rows) if (r.taskId) out.set(r.taskId, Number(r.total ?? 0));
    return out;
  }

  private activityMeta(row: TaskRow): Record<string, unknown> {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const a = meta.activity;
    return a && typeof a === "object" ? (a as Record<string, unknown>) : {};
  }

  private mergeActivityMeta(row: TaskRow, patch: Record<string, unknown>): Record<string, unknown> {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return { ...meta, activity: { ...this.activityMeta(row), ...patch } };
  }

  private toDto(row: TaskRow, trackedSec: number, workerName?: string): ActivityDTO {
    const payType = (row.payType as ActivityDTO["payType"]) ?? "fixed";
    const activityMeta = this.activityMeta(row);
    const status = (row.activityStatus as ActivityStatus) ?? "assigned";
    const earnedCents =
      status === "approved" && typeof activityMeta.earnedCents === "number"
        ? (activityMeta.earnedCents as number)
        : computeActivityEarnedCents({
            payType,
            rateCents: row.rateCents,
            amountCents: row.amountCents,
            trackedSec,
          });
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      workerUserId: row.userId,
      workerName,
      assignedByUserId: row.assignedByUserId ?? undefined,
      companyId: row.companyId ?? undefined,
      payType,
      rateCents: row.rateCents ?? undefined,
      amountCents: row.amountCents ?? undefined,
      currency: row.payCurrency ?? "USD",
      status,
      trackedSec,
      earnedCents,
      dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
      submittedAt: (activityMeta.submittedAt as string) ?? null,
      approvedAt: (activityMeta.approvedAt as string) ?? null,
      rejectionReason: (activityMeta.rejectionReason as string) ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }
}

/** True when a time-entry's taskId points to a paid activity. Used by the
 *  workforce weekly-timesheet path to exclude activity time (which is paid
 *  per-activity on approval) so a person who is both an employee and an
 *  activity worker is never double-paid. */
export async function filterOutActivityTaskIds(
  taskIds: Array<string | null>,
  db = getDb(),
): Promise<Set<string>> {
  const ids = taskIds.filter((t): t is string => !!t);
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(inArray(tasks.id, ids), sql`${tasks.payType} IS NOT NULL`));
  return new Set(rows.map((r) => r.id));
}

export const activityService = new ActivityService();
