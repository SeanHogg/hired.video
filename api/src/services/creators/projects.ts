/**
 * Promo projects — creation from a service inquiry, listing and the single
 * project read. Delivery lifecycle (revisions / decision / extra revision /
 * accept / dispute) lives in ./project-delivery.ts.
 */
import { getDb, type Db } from "../../db/index.js";
import { getSubscription } from "../billing/BillingService.js";
import { emitNotification } from "../notifications/notificationService.js";
import { buildRepos } from "../../repositories/index.js";
import { findActiveEnrollment } from "../../repositories/creatorProfilesRepository.js";
import { findPayoutsEnabled } from "../../repositories/payoutProfilesRepository.js";
import {
  findInquiry,
  findOffering,
  createProjectConversation,
  insertProject,
  markInquiryAccepted,
  listProjectsForUser,
  findProject,
  listRevisions,
  type ProjectListRole,
  type PromoProjectRow,
  type PromoRevisionRow,
} from "../../repositories/creatorProjectsRepository.js";
import {
  listStudioReviewComments,
  type StudioReviewCommentRow,
} from "../../repositories/studioReviewCommentsRepository.js";
import { DEFAULT_PLATFORM_FEE_BPS } from "./enrollment.js";
import { ok, fail, type CreatorResult } from "./result.js";

export const ESCROW_AUTO_RELEASE_DAYS = 7;
export const INCLUDED_REVISIONS = 3;

/** Statuses after which a project accepts no more revisions or purchases. */
export function isClosedProjectStatus(status: string): boolean {
  return status === "accepted" || status === "cancelled" || status === "refunded";
}

/** Best-effort system notification to one party of a promo project, routed
 *  through the single dispatcher so prefs + push apply. */
export async function notifyProjectParty(
  db: Db,
  userId: string,
  type: string,
  title: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await emitNotification(
    { repos: buildRepos(db) },
    { recipientIds: [userId], type, actor: null, title, message, extraData: data },
  ).catch(() => undefined);
}

export function calcFees(priceCents: number, feeBps: number) {
  const platformFeeCents = Math.round((priceCents * feeBps) / 10000);
  const creatorCutCents = priceCents - platformFeeCents;
  return { platformFeeCents, creatorCutCents };
}

export interface CreateProjectInput {
  inquiryId?: string;
  title?: string;
  briefResumeId?: string;
  briefJobId?: string;
  briefNotes?: string;
  briefAssets?: Array<{ url: string; type: string; name?: string }>;
  conversationId?: string;
}

/**
 * The buyer converts their own inquiry into a promo project. Blocks when the
 * creator is inactive, has no payout rail, or their subscription lapsed.
 */
export async function createPromoProject(
  userId: string,
  body: CreateProjectInput,
): Promise<CreatorResult<PromoProjectRow>> {
  if (!body.inquiryId || !body.title?.trim()) {
    return fail(400, "VALIDATION_ERROR", "inquiryId and title are required");
  }
  const db = getDb();
  const inquiry = await findInquiry(db, body.inquiryId);
  if (!inquiry) return fail(404, "NOT_FOUND", "Inquiry not found");
  if (inquiry.fromUserId !== userId) {
    return fail(403, "FORBIDDEN", "Only the buyer can create the project");
  }
  const offering = await findOffering(db, inquiry.serviceId);
  if (!offering) return fail(404, "NOT_FOUND", "Service offering missing");

  const creator = await findActiveEnrollment(db, inquiry.providerId);
  if (!creator || !creator.isActive) {
    return fail(400, "CREATOR_INACTIVE", "Creator is not currently accepting projects");
  }
  // Payout readiness lives on payout_profiles — block paid project creation
  // until the creator has completed onboarding.
  if (!(await findPayoutsEnabled(db, inquiry.providerId))) {
    return fail(400, "CREATOR_NO_PAYOUT", "Creator has not configured payout — cannot accept paid orders");
  }
  // Real-time subscription check — a lapsed Creator subscription must block
  // new orders even if isActive hasn't been reconciled yet.
  const creatorSub = await getSubscription(inquiry.providerId);
  if (!creatorSub.isPro) {
    return fail(400, "CREATOR_SUBSCRIPTION_LAPSED", "Creator subscription is no longer active");
  }

  const title = body.title.trim();
  const priceCents = offering.priceCents ?? 0;
  const feeBps = creator.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS;
  const { platformFeeCents, creatorCutCents } = calcFees(priceCents, feeBps);

  // Auto-create a 1:1 conversation if one wasn't passed in
  const conversationId =
    body.conversationId ||
    (await createProjectConversation(db, `Promo project: ${title}`, inquiry.fromUserId, inquiry.providerId));

  const project = await insertProject(db, {
    customerId: inquiry.fromUserId,
    creatorId: inquiry.providerId,
    inquiryId: inquiry.id,
    serviceOfferingId: offering.id,
    conversationId,
    title,
    briefResumeId: body.briefResumeId ?? null,
    briefJobId: body.briefJobId ?? null,
    briefNotes: body.briefNotes ?? null,
    briefAssets: body.briefAssets ?? [],
    status: "brief",
    revisionsAllowed: INCLUDED_REVISIONS,
    revisionsUsed: 0,
    priceCents,
    currency: "USD",
    platformFeeBps: feeBps,
    platformFeeCents,
    creatorCutCents,
    // Payment is recorded on a separate /pay endpoint once Helcim/Stripe wires up.
    // For v1 we mark as paid immediately if priceCents=0 (free/quote).
    paidAt: priceCents === 0 ? new Date() : null,
  });

  await markInquiryAccepted(db, inquiry.id);
  await notifyProjectParty(
    db,
    inquiry.providerId,
    "promo_project_created",
    `New promo project: ${project.title}`,
    `A customer has started a promo project with you.`,
    { projectId: project.id },
  );
  return ok(project, 201);
}

export async function listPromoProjects(userId: string, role: string | undefined): Promise<PromoProjectRow[]> {
  const listRole: ProjectListRole = role === "creator" || role === "customer" ? role : "any";
  return listProjectsForUser(getDb(), userId, listRole);
}

/** Single project + revisions + linked studio review comments (participants only). */
export interface PromoProjectDetail {
  project: PromoProjectRow;
  revisions: PromoRevisionRow[];
  comments: StudioReviewCommentRow[];
}

export async function getPromoProject(userId: string, projectId: string): Promise<CreatorResult<PromoProjectDetail>> {
  const db = getDb();
  const project = await findProject(db, projectId);
  if (!project) return fail(404, "NOT_FOUND", "Project not found");
  if (project.creatorId !== userId && project.customerId !== userId) {
    return fail(403, "FORBIDDEN", "Not a participant");
  }
  const [revisions, comments] = await Promise.all([
    listRevisions(db, project.id),
    project.studioProjectId
      ? listStudioReviewComments(db, project.studioProjectId, "newest")
      : Promise.resolve([]),
  ]);
  return ok({ project, revisions, comments });
}
