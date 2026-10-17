// Gig disputes (#1768): open, add evidence, view, and mediator resolution
// (release pays the creator via the shared escrow core; refund returns it).

import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { awardedBidderUserId, releaseEscrowCore } from "./gigEscrow.js";
import { bumpGigVersion, DISPUTABLE_MILESTONE_STATUSES, GigError } from "./gigShared.js";

const { gigProjects, gigMilestones, gigDisputes, gigDisputeEvents } = schema;

/** Owner + awarded creator are the dispute participants. */
async function disputeParticipants(projectId: string): Promise<{ ownerUserId: string; creatorUserId: string | null }> {
  const [project] = await getDb()
    .select({ ownerUserId: gigProjects.ownerUserId })
    .from(gigProjects)
    .where(eq(gigProjects.id, projectId))
    .limit(1);
  if (!project) throw new GigError("NOT_FOUND", "Project not found");
  const creatorUserId = await awardedBidderUserId(projectId);
  return { ownerUserId: project.ownerUserId, creatorUserId };
}

/** Open a dispute on a milestone. Either participant may open; the milestone
 *  freezes into 'disputed' and the reason becomes the first timeline entry. */
export async function openDispute(milestoneId: string, byUserId: string, reason: string) {
  const [milestone] = await getDb()
    .select()
    .from(gigMilestones)
    .where(eq(gigMilestones.id, milestoneId))
    .limit(1);
  if (!milestone) throw new GigError("NOT_FOUND", "Milestone not found");
  const { ownerUserId, creatorUserId } = await disputeParticipants(milestone.projectId);
  if (byUserId !== ownerUserId && byUserId !== creatorUserId) {
    throw new GigError("FORBIDDEN", "Only the poster or the awarded creator can open a dispute");
  }
  if (!DISPUTABLE_MILESTONE_STATUSES.has(milestone.status)) {
    throw new GigError("CONFLICT", `A ${milestone.status} milestone cannot be disputed`);
  }

  const dispute = await getDb().transaction(async (tx) => {
    await tx
      .update(gigMilestones)
      .set({ status: "disputed", updatedAt: new Date() })
      .where(eq(gigMilestones.id, milestone.id));
    const [row] = await tx
      .insert(gigDisputes)
      .values({
        milestoneId: milestone.id,
        projectId: milestone.projectId,
        openedByUserId: byUserId,
        reason,
        status: "open",
      })
      .returning();
    await tx.insert(gigDisputeEvents).values({
      disputeId: row.id,
      authorUserId: byUserId,
      kind: "evidence",
      body: reason,
    });
    return row;
  });

  bumpGigVersion();
  return dispute;
}

async function requireOpenDisputeParticipant(disputeId: string, userId: string, allowMediator: boolean) {
  const [dispute] = await getDb()
    .select()
    .from(gigDisputes)
    .where(eq(gigDisputes.id, disputeId))
    .limit(1);
  if (!dispute) throw new GigError("NOT_FOUND", "Dispute not found");
  const { ownerUserId, creatorUserId } = await disputeParticipants(dispute.projectId);
  const isParticipant = userId === ownerUserId || userId === creatorUserId;
  if (!isParticipant && !allowMediator) throw new GigError("FORBIDDEN", "Not a dispute participant");
  return { dispute, ownerUserId, creatorUserId, isParticipant };
}

/** Append an evidence/comment entry to an open dispute's timeline. */
export async function addDisputeEvent(
  disputeId: string,
  authorUserId: string,
  kind: "evidence" | "comment",
  body: string,
  attachments: Array<{ url: string; name?: string }> = [],
) {
  const { dispute } = await requireOpenDisputeParticipant(disputeId, authorUserId, false);
  if (dispute.status !== "open") throw new GigError("CONFLICT", "Dispute is already resolved");
  const [event] = await getDb()
    .insert(gigDisputeEvents)
    .values({ disputeId, authorUserId, kind, body, attachments })
    .returning();
  bumpGigVersion();
  return event;
}

/** Full dispute view (dispute + milestone + ordered timeline) for the latest
 *  dispute on a milestone. Access = participants or a mediator (SuperAdmin). */
export async function getDisputeForMilestone(milestoneId: string, requesterUserId: string, isMediator: boolean) {
  const [dispute] = await getDb()
    .select()
    .from(gigDisputes)
    .where(eq(gigDisputes.milestoneId, milestoneId))
    .orderBy(desc(gigDisputes.createdAt))
    .limit(1);
  if (!dispute) throw new GigError("NOT_FOUND", "No dispute for this milestone");
  const { ownerUserId, creatorUserId } = await disputeParticipants(dispute.projectId);
  const isParticipant = requesterUserId === ownerUserId || requesterUserId === creatorUserId;
  if (!isParticipant && !isMediator) throw new GigError("FORBIDDEN", "Not a dispute participant");
  const events = await getDb()
    .select()
    .from(gigDisputeEvents)
    .where(eq(gigDisputeEvents.disputeId, dispute.id))
    .orderBy(asc(gigDisputeEvents.createdAt));
  return { dispute, events };
}

/** Mediator decision: 'release' pays the creator, 'refund' returns the
 *  milestone to the poster. Closes the dispute. Caller verifies mediator
 *  authority (SuperAdmin) before calling. */
export async function resolveDispute(
  disputeId: string,
  mediatorUserId: string,
  resolution: "release" | "refund",
  note: string,
) {
  const [dispute] = await getDb()
    .select()
    .from(gigDisputes)
    .where(eq(gigDisputes.id, disputeId))
    .limit(1);
  if (!dispute) throw new GigError("NOT_FOUND", "Dispute not found");
  if (dispute.status !== "open") throw new GigError("CONFLICT", "Dispute is already resolved");
  const [milestone] = await getDb()
    .select()
    .from(gigMilestones)
    .where(eq(gigMilestones.id, dispute.milestoneId))
    .limit(1);
  if (!milestone) throw new GigError("NOT_FOUND", "Milestone not found");

  let payout: { grossCents: number; platformFeeCents: number; creatorCents: number } | null = null;
  if (resolution === "release") {
    const bidderUserId = await awardedBidderUserId(dispute.projectId);
    if (!bidderUserId) throw new GigError("CONFLICT", "Project has no awarded bidder to pay");
    payout = await releaseEscrowCore(milestone, bidderUserId);
  } else {
    await getDb()
      .update(gigMilestones)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(gigMilestones.id, milestone.id));
  }

  const now = new Date();
  const [resolved] = await getDb()
    .update(gigDisputes)
    .set({
      status: "resolved",
      resolution,
      resolutionNote: note,
      resolvedByUserId: mediatorUserId,
      resolvedAt: now,
      updatedAt: now,
    })
    .where(eq(gigDisputes.id, dispute.id))
    .returning();
  await getDb().insert(gigDisputeEvents).values({
    disputeId: dispute.id,
    authorUserId: mediatorUserId,
    kind: "decision",
    body: `Resolved — escrow ${resolution === "release" ? "released to creator" : "refunded to poster"}. ${note}`,
  });

  bumpGigVersion();
  return { dispute: resolved, payout };
}
