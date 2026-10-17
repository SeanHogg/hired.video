// Gig milestones + escrow (#101): poster-side milestone controls and the
// escrow release shared by the route and dispute resolution.

import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { bumpGigVersion, GigError, GIG_PLATFORM_FEE_RATE } from "./gigShared.js";

const { gigProjects, gigBids, gigMilestones } = schema;

// ── milestones (poster-side escrow controls) ──────────────────────────────

export async function addMilestone(
  projectId: string,
  ownerUserId: string,
  input: { ordinal?: number; title: string; amountCents: number; description?: string },
) {
  const [project] = await getDb()
    .select({ id: gigProjects.id, ownerUserId: gigProjects.ownerUserId })
    .from(gigProjects)
    .where(eq(gigProjects.id, projectId))
    .limit(1);
  if (!project) throw new GigError("NOT_FOUND", "Project not found");
  if (project.ownerUserId !== ownerUserId) throw new GigError("FORBIDDEN", "Owner only");
  const [row] = await getDb()
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
  bumpGigVersion();
  return row;
}

export async function approveMilestone(milestoneId: string, ownerUserId: string) {
  const milestone = await requireOwnedMilestone(milestoneId, ownerUserId);
  const [row] = await getDb()
    .update(gigMilestones)
    .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(gigMilestones.id, milestone.id))
    .returning();
  bumpGigVersion();
  return row;
}

async function requireOwnedMilestone(milestoneId: string, ownerUserId: string) {
  const [milestone] = await getDb()
    .select()
    .from(gigMilestones)
    .where(eq(gigMilestones.id, milestoneId))
    .limit(1);
  if (!milestone) throw new GigError("NOT_FOUND", "Milestone not found");
  const [project] = await getDb()
    .select({ ownerUserId: gigProjects.ownerUserId, awardedBidId: gigProjects.awardedBidId })
    .from(gigProjects)
    .where(eq(gigProjects.id, milestone.projectId))
    .limit(1);
  if (!project || project.ownerUserId !== ownerUserId) throw new GigError("FORBIDDEN", "Owner only");
  return milestone;
}

// ── escrow release (shared by the route + dispute resolution) ──────────────

/** Resolve the awarded creator's user id for a project, or null if unawarded. */
export async function awardedBidderUserId(projectId: string): Promise<string | null> {
  const [project] = await getDb()
    .select({ awardedBidId: gigProjects.awardedBidId })
    .from(gigProjects)
    .where(eq(gigProjects.id, projectId))
    .limit(1);
  if (!project?.awardedBidId) return null;
  const [bid] = await getDb()
    .select({ bidderUserId: gigBids.bidderUserId })
    .from(gigBids)
    .where(eq(gigBids.id, project.awardedBidId))
    .limit(1);
  return bid?.bidderUserId ?? null;
}

/** Core escrow release: credit the bidder (minus the platform fee) and flip
 *  the milestone to 'released'. Authority + releasable-state are the caller's
 *  responsibility — the normal route gates on owner + 'approved'; dispute
 *  resolution releases a 'disputed' milestone on the mediator's decision. */
export async function releaseEscrowCore(
  milestone: { id: string; amountCents: number; title: string },
  bidderUserId: string,
): Promise<{ grossCents: number; platformFeeCents: number; creatorCents: number }> {
  const grossCents = milestone.amountCents;
  const platformFeeCents = Math.round(grossCents * GIG_PLATFORM_FEE_RATE);
  const creatorCents = grossCents - platformFeeCents;
  const { payoutLedgerService } = await import("../payout/PayoutLedgerService.js");
  await payoutLedgerService.recordAccrual({
    userId: bidderUserId,
    amountCents: creatorCents,
    currency: "USD",
    sourceKind: "service_order",
    sourceId: milestone.id,
    note: `Gig milestone "${milestone.title}" released (10% platform fee: $${(platformFeeCents / 100).toFixed(2)})`,
  });
  await getDb()
    .update(gigMilestones)
    .set({ status: "released", releasedAt: new Date(), updatedAt: new Date() })
    .where(eq(gigMilestones.id, milestone.id));
  return { grossCents, platformFeeCents, creatorCents };
}

/** Owner-gated release of an approved milestone (the normal happy path). */
export async function releaseMilestoneEscrow(milestoneId: string, ownerUserId: string) {
  const [milestone] = await getDb()
    .select()
    .from(gigMilestones)
    .where(eq(gigMilestones.id, milestoneId))
    .limit(1);
  if (!milestone) throw new GigError("NOT_FOUND", "Milestone not found");
  if (milestone.status !== "approved") {
    throw new GigError("CONFLICT", "Milestone must be approved before release");
  }
  const [project] = await getDb()
    .select({ ownerUserId: gigProjects.ownerUserId })
    .from(gigProjects)
    .where(eq(gigProjects.id, milestone.projectId))
    .limit(1);
  if (!project || project.ownerUserId !== ownerUserId) throw new GigError("FORBIDDEN", "Owner only");
  const bidderUserId = await awardedBidderUserId(milestone.projectId);
  if (!bidderUserId) throw new GigError("CONFLICT", "Project has no awarded bidder");

  const payout = await releaseEscrowCore(milestone, bidderUserId);
  bumpGigVersion();
  return { milestone: { ...milestone, status: "released" }, payout, bidderUserId };
}
