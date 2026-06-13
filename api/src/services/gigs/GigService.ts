// GigService — freelance / gig marketplace domain logic (#101).
//
// Hybrid model (decided 2026-06-12):
//   • gig_projects / gig_bids  — the marketplace: any user posts a brief with
//     deliverable items, others bid, the owner awards one. (#101 backend)
//   • gig_milestones           — the deliverable items, defined at post time,
//     each carrying its own escrow amount + status machine.
//   • tasks                    — on award, every milestone is materialised as
//     a personal task owned by the winning creator, so they work the gig on
//     the SAME reusable kanban board as their personal tasks (Content Creator
//     → Gigs). The task ↔ milestone link (tasks.gig_milestone_id) keeps the
//     two in lock-step: completing the task submits the milestone for the
//     poster to approve + release escrow.
//
// Route handlers stay thin — all multi-table writes (award, status sync) live
// here behind a transaction so the bridge can't half-apply.

import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getOrCreateDefaultBoard } from "../productivity/default-board.js";
import { toTaskDto, type TaskDto } from "../productivity/task-dto.js";

const { gigProjects, gigBids, gigMilestones, tasks, users, userProfiles } = schema;

// ── status vocabularies ──────────────────────────────────────────────────
// Personal-task status (frontend ProductivityItemStatus): ToDo=1, InProgress=3,
// Completed=6. We materialise gig work at ToDo and read completion at 6.
const TASK_TODO = 1;
const TASK_COMPLETED_STATUSES = new Set([4, 6]); // Closed | Completed

/** Map a personal-task status → the gig milestone status it implies. The
 *  poster-only states (approved / released) are never set from here. */
function taskStatusToMilestone(legacyStatus: number): "pending" | "in_progress" | "submitted" {
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

export class GigError extends Error {
  constructor(
    public code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "VALIDATION_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "GigError";
  }
}

export class GigService {
  private get db() {
    return getDb();
  }

  // ── projects ─────────────────────────────────────────────────────────────

  /** Create a brief + its deliverable items (milestones). Any user may post. */
  async createProject(ownerUserId: string, input: CreateGigInput) {
    if (input.budgetMaxCents < input.budgetMinCents) {
      throw new GigError("VALIDATION_ERROR", "budgetMaxCents must be >= budgetMinCents");
    }
    const items = input.items ?? [];
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .insert(gigProjects)
        .values({
          ownerUserId,
          title: input.title,
          description: input.description,
          requiredSkills: input.requiredSkills ?? [],
          budgetKind: input.budgetKind ?? "fixed",
          budgetMinCents: input.budgetMinCents,
          budgetMaxCents: input.budgetMaxCents,
          estimatedDurationDays: input.estimatedDurationDays ?? null,
          status: "open",
        })
        .returning();

      let milestones: (typeof gigMilestones.$inferSelect)[] = [];
      if (items.length > 0) {
        milestones = await tx
          .insert(gigMilestones)
          .values(
            items.map((it, i) => ({
              projectId: project.id,
              ordinal: i,
              title: it.title,
              amountCents: it.amountCents,
              description: it.description ?? null,
              status: "pending" as const,
            })),
          )
          .returning();
      }
      return { project, milestones };
    });
  }

  /** Open briefs accepting bids — the public marketplace grid. */
  async listOpenProjects(limit = 100) {
    const rows = await this.db
      .select()
      .from(gigProjects)
      .where(eq(gigProjects.status, "open"))
      .orderBy(desc(gigProjects.createdAt))
      .limit(limit);
    return rows;
  }

  /** The caller's own posted briefs (owner view). */
  async listMyProjects(ownerUserId: string) {
    return this.db
      .select()
      .from(gigProjects)
      .where(eq(gigProjects.ownerUserId, ownerUserId))
      .orderBy(desc(gigProjects.createdAt));
  }

  /** Project + its deliverable items. Public read (bids are owner-gated). */
  async getProject(projectId: string) {
    const [project] = await this.db
      .select()
      .from(gigProjects)
      .where(eq(gigProjects.id, projectId))
      .limit(1);
    if (!project) throw new GigError("NOT_FOUND", "Project not found");
    const milestones = await this.db
      .select()
      .from(gigMilestones)
      .where(eq(gigMilestones.projectId, projectId))
      .orderBy(asc(gigMilestones.ordinal));
    return { project, milestones };
  }

  // ── bids ───────────────────────────────────────────────────────────────

  async placeBid(projectId: string, bidderUserId: string, input: PlaceBidInput) {
    const [project] = await this.db
      .select({ id: gigProjects.id, ownerUserId: gigProjects.ownerUserId, status: gigProjects.status })
      .from(gigProjects)
      .where(eq(gigProjects.id, projectId))
      .limit(1);
    if (!project) throw new GigError("NOT_FOUND", "Project not found");
    if (project.ownerUserId === bidderUserId) {
      throw new GigError("FORBIDDEN", "You can't bid on your own project");
    }
    if (project.status !== "open") {
      throw new GigError("CONFLICT", "Project is not accepting bids");
    }
    const [row] = await this.db
      .insert(gigBids)
      .values({
        projectId: project.id,
        bidderUserId,
        coverLetter: input.coverLetter,
        proposedAmountCents: input.proposedAmountCents,
        proposedDurationDays: input.proposedDurationDays ?? null,
        status: "submitted",
      })
      .onConflictDoUpdate({
        target: [gigBids.projectId, gigBids.bidderUserId],
        set: {
          coverLetter: input.coverLetter,
          proposedAmountCents: input.proposedAmountCents,
          proposedDurationDays: input.proposedDurationDays ?? null,
          status: "submitted",
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  /** Owner-gated list of bids on a project, with bidder display name. */
  async listBidsForProject(projectId: string, ownerUserId: string) {
    const [project] = await this.db
      .select({ ownerUserId: gigProjects.ownerUserId })
      .from(gigProjects)
      .where(eq(gigProjects.id, projectId))
      .limit(1);
    if (!project) throw new GigError("NOT_FOUND", "Project not found");
    if (project.ownerUserId !== ownerUserId) {
      throw new GigError("FORBIDDEN", "Only the project owner can view bids");
    }
    return this.db
      .select({
        bid: gigBids,
        bidderName: users.name,
        bidderAvatarUrl: userProfiles.avatarUrl,
      })
      .from(gigBids)
      .leftJoin(users, eq(users.id, gigBids.bidderUserId))
      .leftJoin(userProfiles, eq(userProfiles.userId, gigBids.bidderUserId))
      .where(eq(gigBids.projectId, projectId))
      .orderBy(asc(gigBids.proposedAmountCents));
  }

  /** Bids the caller has placed, each with its project summary. */
  async listMyBids(bidderUserId: string) {
    return this.db
      .select({ bid: gigBids, project: gigProjects })
      .from(gigBids)
      .innerJoin(gigProjects, eq(gigProjects.id, gigBids.projectId))
      .where(eq(gigBids.bidderUserId, bidderUserId))
      .orderBy(desc(gigBids.createdAt));
  }

  /**
   * Award a bid: mark it awarded, reject the competing bids, move the project
   * to in_progress, and materialise every deliverable item as a personal task
   * owned by the winning creator. Idempotent-safe via the unique index on
   * tasks.gig_milestone_id (a retry skips already-bridged milestones).
   */
  async awardBid(bidId: string, ownerUserId: string) {
    const [bid] = await this.db.select().from(gigBids).where(eq(gigBids.id, bidId)).limit(1);
    if (!bid) throw new GigError("NOT_FOUND", "Bid not found");
    const [project] = await this.db
      .select()
      .from(gigProjects)
      .where(eq(gigProjects.id, bid.projectId))
      .limit(1);
    if (!project) throw new GigError("NOT_FOUND", "Project not found");
    if (project.ownerUserId !== ownerUserId) throw new GigError("FORBIDDEN", "Owner only");
    if (project.status !== "open") {
      throw new GigError("CONFLICT", "Project already in progress / closed");
    }

    const boardId = await getOrCreateDefaultBoard(bid.bidderUserId, this.db);
    const milestones = await this.db
      .select()
      .from(gigMilestones)
      .where(eq(gigMilestones.projectId, project.id))
      .orderBy(asc(gigMilestones.ordinal));

    // Milestones already bridged in a prior (failed) award → don't double-insert.
    const alreadyBridged = milestones.length
      ? new Set(
          (
            await this.db
              .select({ gigMilestoneId: tasks.gigMilestoneId })
              .from(tasks)
              .where(inArray(tasks.gigMilestoneId, milestones.map((m) => m.id)))
          ).map((r) => r.gigMilestoneId),
        )
      : new Set<string | null>();

    const nowIso = new Date().toISOString();
    const endIso = project.estimatedDurationDays
      ? new Date(Date.now() + project.estimatedDurationDays * 86_400_000).toISOString()
      : undefined;

    await this.db.transaction(async (tx) => {
      await tx.update(gigBids).set({ status: "awarded", updatedAt: new Date() }).where(eq(gigBids.id, bid.id));
      await tx
        .update(gigBids)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(and(eq(gigBids.projectId, project.id), eq(gigBids.status, "submitted")));
      await tx
        .update(gigProjects)
        .set({ status: "in_progress", awardedBidId: bid.id, updatedAt: new Date() })
        .where(eq(gigProjects.id, project.id));

      const fresh = milestones.filter((m) => !alreadyBridged.has(m.id));
      if (fresh.length > 0) {
        await tx.insert(tasks).values(
          fresh.map((m) => ({
            boardId,
            userId: bid.bidderUserId,
            title: m.title,
            description: m.description,
            gigProjectId: project.id,
            gigMilestoneId: m.id,
            // Legacy DTO fields live in metadata. taskType 1 = Project.
            metadata: {
              start: nowIso,
              end: endIso,
              taskType: 1,
              legacyStatus: TASK_TODO,
              gigProjectId: project.id,
              gigTitle: project.title,
            } as Record<string, unknown>,
          })) as any,
        );
        await tx
          .update(gigMilestones)
          .set({ status: "in_progress", updatedAt: new Date() })
          .where(inArray(gigMilestones.id, fresh.map((m) => m.id)));
      }
    });

    return { awarded: true, bidId: bid.id, projectId: project.id, tasksCreated: milestones.length };
  }

  // ── creator work board ────────────────────────────────────────────────────

  /** The creator's awarded gig work — materialised tasks as TaskDTOs, plus the
   *  parent projects so the Gigs tab can group + label. */
  async listMyWork(creatorUserId: string): Promise<{
    tasks: TaskDto[];
    projects: { id: string; title: string; status: string }[];
  }> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, creatorUserId), isNotNull(tasks.gigProjectId)))
      .orderBy(desc(tasks.createdAt));
    const dtos = rows.map(toTaskDto);

    const projectIds = Array.from(new Set(rows.map((r) => r.gigProjectId).filter(Boolean) as string[]));
    const projects = projectIds.length
      ? await this.db
          .select({ id: gigProjects.id, title: gigProjects.title, status: gigProjects.status })
          .from(gigProjects)
          .where(inArray(gigProjects.id, projectIds))
      : [];
    return { tasks: dtos, projects };
  }

  /**
   * Update a gig work item's status (creator-driven, from the kanban). Writes
   * the task's legacyStatus AND syncs the linked milestone so the poster sees
   * progress. Creator-owned tasks only.
   */
  async updateWorkStatus(taskId: string, creatorUserId: string, legacyStatus: number): Promise<TaskDto> {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, creatorUserId), isNotNull(tasks.gigProjectId)))
      .limit(1);
    if (!task) throw new GigError("NOT_FOUND", "Gig work item not found");

    const existingMeta = (task.metadata as Record<string, unknown> | null) ?? {};
    const [updated] = await this.db
      .update(tasks)
      .set({
        metadata: { ...existingMeta, legacyStatus },
        completedAt: TASK_COMPLETED_STATUSES.has(legacyStatus) ? new Date() : null,
        updatedAt: new Date(),
      } as any)
      .where(eq(tasks.id, taskId))
      .returning();

    if (task.gigMilestoneId) {
      // Never downgrade a milestone the poster already approved/released.
      const [milestone] = await this.db
        .select({ status: gigMilestones.status })
        .from(gigMilestones)
        .where(eq(gigMilestones.id, task.gigMilestoneId))
        .limit(1);
      const locked = milestone && ["approved", "released", "disputed"].includes(milestone.status);
      if (!locked) {
        await this.db
          .update(gigMilestones)
          .set({ status: taskStatusToMilestone(legacyStatus), updatedAt: new Date() })
          .where(eq(gigMilestones.id, task.gigMilestoneId));
      }
    }
    return toTaskDto(updated);
  }

  // ── milestones (poster-side escrow controls) ──────────────────────────────

  async addMilestone(
    projectId: string,
    ownerUserId: string,
    input: { ordinal?: number; title: string; amountCents: number; description?: string },
  ) {
    const [project] = await this.db
      .select({ id: gigProjects.id, ownerUserId: gigProjects.ownerUserId })
      .from(gigProjects)
      .where(eq(gigProjects.id, projectId))
      .limit(1);
    if (!project) throw new GigError("NOT_FOUND", "Project not found");
    if (project.ownerUserId !== ownerUserId) throw new GigError("FORBIDDEN", "Owner only");
    const [row] = await this.db
      .insert(gigMilestones)
      .values({
        projectId: project.id,
        ordinal: input.ordinal ?? 0,
        title: input.title,
        amountCents: input.amountCents,
        description: input.description ?? null,
        status: "pending",
      })
      .returning();
    return row;
  }

  async approveMilestone(milestoneId: string, ownerUserId: string) {
    const milestone = await this.requireOwnedMilestone(milestoneId, ownerUserId);
    const [row] = await this.db
      .update(gigMilestones)
      .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(gigMilestones.id, milestone.id))
      .returning();
    return row;
  }

  private async requireOwnedMilestone(milestoneId: string, ownerUserId: string) {
    const [milestone] = await this.db
      .select()
      .from(gigMilestones)
      .where(eq(gigMilestones.id, milestoneId))
      .limit(1);
    if (!milestone) throw new GigError("NOT_FOUND", "Milestone not found");
    const [project] = await this.db
      .select({ ownerUserId: gigProjects.ownerUserId, awardedBidId: gigProjects.awardedBidId })
      .from(gigProjects)
      .where(eq(gigProjects.id, milestone.projectId))
      .limit(1);
    if (!project || project.ownerUserId !== ownerUserId) throw new GigError("FORBIDDEN", "Owner only");
    return milestone;
  }
}

export const gigService = new GigService();
