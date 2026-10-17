/**
 * Promo-project delivery lifecycle: the creator submits revisions, the
 * customer decides on them / buys extra revisions / accepts delivery
 * (releasing escrow), and either party can open a dispute.
 */
import { getDb } from "../../db/index.js";
import { payoutLedgerService } from "../payout/PayoutLedgerService.js";
import {
  findActiveEnrollment,
  incrementCompletedProjects,
} from "../../repositories/creatorProfilesRepository.js";
import { insertPortfolioItemQuietly } from "../../repositories/creatorPortfolioRepository.js";
import {
  findProject,
  updateProject,
  insertRevision,
  findRevision,
  recordRevisionDecision,
  insertExtraRevisionPurchase,
  type PromoProjectRow,
  type PromoRevisionRow,
  type ExtraRevisionPurchaseRow,
} from "../../repositories/creatorProjectsRepository.js";
import {
  ESCROW_AUTO_RELEASE_DAYS,
  INCLUDED_REVISIONS,
  calcFees,
  isClosedProjectStatus,
  notifyProjectParty,
} from "./projects.js";
import { ok, fail, type CreatorResult } from "./result.js";

const projectNotFound = () => fail(404, "NOT_FOUND", "Project not found");
const closedProject = (status: string) => fail(400, "INVALID_STATE", `Project is ${status}`);

export interface SubmitRevisionInput {
  videoUrl?: string;
  thumbnailUrl?: string;
  storyboardSnapshot?: unknown;
  durationMs?: number;
  creatorNotes?: string;
}

/** Creator submits a new revision; the project moves to delivered. */
export async function submitRevision(
  userId: string,
  projectId: string,
  body: SubmitRevisionInput,
): Promise<CreatorResult<PromoRevisionRow>> {
  if (!body.videoUrl) return fail(400, "VALIDATION_ERROR", "videoUrl is required");
  const db = getDb();
  const project = await findProject(db, projectId);
  if (!project) return projectNotFound();
  if (project.creatorId !== userId) {
    return fail(403, "FORBIDDEN", "Only the creator can submit revisions");
  }
  if (isClosedProjectStatus(project.status)) return closedProject(project.status);
  if (project.revisionsUsed >= project.revisionsAllowed) {
    return fail(402, "REVISION_LIMIT", "Revision limit reached. Customer must purchase an extra revision.");
  }

  const nextNumber = project.revisionsUsed + 1;
  const rev = await insertRevision(db, {
    projectId: project.id,
    revisionNumber: nextNumber,
    isPaidExtra: nextNumber > INCLUDED_REVISIONS,
    videoUrl: body.videoUrl,
    thumbnailUrl: body.thumbnailUrl ?? null,
    storyboardSnapshot: body.storyboardSnapshot ?? null,
    durationMs: body.durationMs ?? null,
    creatorNotes: body.creatorNotes ?? null,
  });

  await updateProject(db, project.id, {
    revisionsUsed: nextNumber,
    status: "delivered",
    deliveredVideoUrl: body.videoUrl,
    deliveredAt: new Date(),
    autoReleaseAt: new Date(Date.now() + ESCROW_AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  });

  await notifyProjectParty(
    db,
    project.customerId,
    "promo_revision_submitted",
    `Revision ${nextNumber} delivered: ${project.title}`,
    `Your creator submitted revision ${nextNumber} for review.`,
    { projectId: project.id, revisionId: rev.id },
  );
  return ok(rev, 201);
}

/**
 * Customer approves / requests changes on a revision. Approval leaves the
 * project delivered (the customer must /accept to release escrow); a change
 * request returns it to in_progress.
 */
export async function decideRevision(
  userId: string,
  projectId: string,
  revisionId: string,
  body: { decision?: string; feedback?: string },
): Promise<CreatorResult<{ ok: true }>> {
  if (!body.decision || !["approved", "changes_requested"].includes(body.decision)) {
    return fail(400, "VALIDATION_ERROR", "decision must be 'approved' or 'changes_requested'");
  }
  const db = getDb();
  const project = await findProject(db, projectId);
  if (!project) return projectNotFound();
  if (project.customerId !== userId) {
    return fail(403, "FORBIDDEN", "Only the customer can decide on revisions");
  }
  const rev = await findRevision(db, revisionId, project.id);
  if (!rev) return fail(404, "NOT_FOUND", "Revision not found");

  await recordRevisionDecision(db, rev.id, body.decision, body.feedback ?? null);
  if (body.decision === "changes_requested") {
    await updateProject(db, project.id, { status: "in_progress", updatedAt: new Date() });
  }

  await notifyProjectParty(
    db,
    project.creatorId,
    "promo_revision_decision",
    `Revision ${rev.revisionNumber} ${body.decision === "approved" ? "approved" : "needs changes"}`,
    body.feedback ?? "",
    { projectId: project.id, revisionId: rev.id },
  );
  return ok({ ok: true as const });
}

/** Customer pays for one additional revision. */
export async function buyExtraRevision(
  userId: string,
  projectId: string,
): Promise<CreatorResult<ExtraRevisionPurchaseRow>> {
  const db = getDb();
  const project = await findProject(db, projectId);
  if (!project) return projectNotFound();
  if (project.customerId !== userId) {
    return fail(403, "FORBIDDEN", "Only the customer can purchase revisions");
  }
  if (isClosedProjectStatus(project.status)) return closedProject(project.status);
  const creator = await findActiveEnrollment(db, project.creatorId);
  if (!creator) return fail(404, "NOT_FOUND", "Creator profile missing");

  const priceCents = creator.extraRevisionPriceCents > 0
    ? creator.extraRevisionPriceCents
    : Math.max(Math.round(project.priceCents * 0.25), 500); // default = 25% of base, min $5
  const feeBps = project.platformFeeBps;
  const { platformFeeCents, creatorCutCents } = calcFees(priceCents, feeBps);

  const purchase = await insertExtraRevisionPurchase(db, {
    projectId: project.id,
    customerId: userId,
    priceCents,
    currency: project.currency,
    platformFeeBps: feeBps,
    platformFeeCents,
    creatorCutCents,
    paidAt: new Date(), // payment provider integration handled separately
    revisionsAdded: 1,
  });
  await updateProject(db, project.id, { revisionsAllowed: project.revisionsAllowed + 1, updatedAt: new Date() });

  await notifyProjectParty(
    db,
    project.creatorId,
    "promo_extra_revision_purchased",
    `Extra revision purchased: ${project.title}`,
    `Customer purchased an extra revision.`,
    { projectId: project.id, purchaseId: purchase.id },
  );
  return ok(purchase, 201);
}

/**
 * Customer accepts delivery: escrow released, creator aggregates + payout
 * ledger accrual, optional portfolio add (with consent). Idempotent — an
 * already-accepted project returns the project row itself.
 */
export async function acceptDelivery(
  userId: string,
  projectId: string,
  portfolioConsent: boolean | undefined,
): Promise<CreatorResult<PromoProjectRow | { accepted: true }>> {
  const db = getDb();
  const project = await findProject(db, projectId);
  if (!project) return projectNotFound();
  if (project.customerId !== userId) {
    return fail(403, "FORBIDDEN", "Only the customer can accept delivery");
  }
  if (project.status === "accepted") return ok(project);
  if (!project.deliveredAt) return fail(400, "INVALID_STATE", "Nothing delivered to accept yet");

  const now = new Date();
  await updateProject(db, project.id, {
    status: "accepted",
    acceptedAt: now,
    escrowReleasedAt: now,
    portfolioConsent: portfolioConsent ?? false,
    updatedAt: now,
  });

  // Lifetime totalEarnedCents is bumped inside PayoutLedgerService.recordAccrual
  // so the ledger and the denormalised counter stay in lock-step.
  await incrementCompletedProjects(db, project.creatorId, now);
  if (project.creatorCutCents > 0) {
    await payoutLedgerService.recordAccrual({
      userId: project.creatorId,
      amountCents: project.creatorCutCents,
      currency: project.currency,
      sourceKind: "promo_project",
      sourceId: project.id,
      note: `Promo project accepted: ${project.title}`,
    });
  }

  // Auto-add to portfolio if customer consented
  if (portfolioConsent && project.deliveredVideoUrl) {
    await insertPortfolioItemQuietly(db, {
      userId: project.creatorId,
      title: project.title,
      mediaType: "video",
      mediaUrl: project.deliveredVideoUrl,
      source: "promo_project",
      sourcePromoProjectId: project.id,
      customerConsent: true,
      isPublic: true,
    });
  }

  await notifyProjectParty(
    db,
    project.creatorId,
    "promo_project_accepted",
    `Project accepted: ${project.title}`,
    `Funds released. Time to celebrate.`,
    { projectId: project.id },
  );
  return ok({ accepted: true as const });
}

/** Either participant opens a dispute (manual admin resolution). */
export async function disputeProject(
  userId: string,
  projectId: string,
  reason: string | undefined,
): Promise<CreatorResult<{ disputed: true }>> {
  const db = getDb();
  const project = await findProject(db, projectId);
  if (!project) return projectNotFound();
  if (project.customerId !== userId && project.creatorId !== userId) {
    return fail(403, "FORBIDDEN", "Not a participant");
  }
  await updateProject(db, project.id, { status: "disputed", updatedAt: new Date() });

  const otherParty = userId === project.customerId ? project.creatorId : project.customerId;
  await notifyProjectParty(db, otherParty, "promo_project_disputed", `Project disputed: ${project.title}`, reason ?? "", { projectId: project.id });
  return ok({ disputed: true as const });
}
