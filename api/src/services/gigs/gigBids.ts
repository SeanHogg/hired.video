// Gig bids (#101): place / list bids and award one. Awarding materialises
// every deliverable item as a personal task owned by the winning creator.

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";
import { getOrCreateDefaultBoard } from "../productivity/default-board.js";
import { bumpGigVersion, gigCacheVersion, GigError, GIG_TTL_SECONDS, TASK_TODO, type PlaceBidInput } from "./gigShared.js";

const { gigProjects, gigBids, gigMilestones, tasks, users, userProfiles } = schema;

export async function placeBid(projectId: string, bidderUserId: string, input: PlaceBidInput) {
  const [project] = await getDb()
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
  const [row] = await getDb()
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
  bumpGigVersion();
  return row;
}

/** Owner-gated list of bids on a project, with bidder display name. */
export async function listBidsForProject(projectId: string, ownerUserId: string) {
  const [project] = await getDb()
    .select({ ownerUserId: gigProjects.ownerUserId })
    .from(gigProjects)
    .where(eq(gigProjects.id, projectId))
    .limit(1);
  if (!project) throw new GigError("NOT_FOUND", "Project not found");
  if (project.ownerUserId !== ownerUserId) {
    throw new GigError("FORBIDDEN", "Only the project owner can view bids");
  }
  return getDb()
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

/** Bids the caller has placed, each with its project summary. Cached per user. */
export async function listMyBids(bidderUserId: string) {
  const v = await gigCacheVersion();
  return getOrSetIsolateCached<{ bid: typeof gigBids.$inferSelect; project: typeof gigProjects.$inferSelect }[]>({
    key: `gigs:mybids:v1:${bidderUserId}:${v}`,
    ttlSeconds: GIG_TTL_SECONDS,
    loader: () =>
      getDb()
        .select({ bid: gigBids, project: gigProjects })
        .from(gigBids)
        .innerJoin(gigProjects, eq(gigProjects.id, gigBids.projectId))
        .where(eq(gigBids.bidderUserId, bidderUserId))
        .orderBy(desc(gigBids.createdAt)),
  });
}

/**
 * Award a bid: mark it awarded, reject the competing bids, move the project
 * to in_progress, and materialise every deliverable item as a personal task
 * owned by the winning creator. Idempotent-safe via the unique index on
 * tasks.gig_milestone_id (a retry skips already-bridged milestones).
 */
export async function awardBid(bidId: string, ownerUserId: string) {
  const [bid] = await getDb().select().from(gigBids).where(eq(gigBids.id, bidId)).limit(1);
  if (!bid) throw new GigError("NOT_FOUND", "Bid not found");
  const [project] = await getDb()
    .select()
    .from(gigProjects)
    .where(eq(gigProjects.id, bid.projectId))
    .limit(1);
  if (!project) throw new GigError("NOT_FOUND", "Project not found");
  if (project.ownerUserId !== ownerUserId) throw new GigError("FORBIDDEN", "Owner only");
  if (project.status !== "open") {
    throw new GigError("CONFLICT", "Project already in progress / closed");
  }

  const boardId = await getOrCreateDefaultBoard(bid.bidderUserId, getDb());
  const milestones = await getDb()
    .select()
    .from(gigMilestones)
    .where(eq(gigMilestones.projectId, project.id))
    .orderBy(asc(gigMilestones.ordinal));

  // Milestones already bridged in a prior (failed) award → don't double-insert.
  const alreadyBridged = milestones.length
    ? new Set(
        (
          await getDb()
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

  await getDb().transaction(async (tx) => {
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

  bumpGigVersion();
  return { awarded: true, bidId: bid.id, projectId: project.id, tasksCreated: milestones.length };
}
