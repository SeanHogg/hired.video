/**
 * Best-effort side effects of the resume-feedback flow (#1946): invite emails,
 * in-app notifications and external-reviewer lead capture. Called
 * fire-and-forget from routes/resume-feedback.ts — never blocks or fails the
 * request.
 */
import type { ResumeReviewDTO } from "../../../../shared/resume-feedback.js";
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { emitNotification, resolveActor } from "../notifications/notificationService.js";
import { sendReviewInviteEmail, buildReviewUrl } from "../adapters/email.js";
import { logger } from "../../lib/logger.js";

/** Human-friendly TTL for the invite email ("42 hours" / "3 days"). */
function humanExpiry(hours: number | undefined): string | null {
  if (!hours || hours <= 0) return null;
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Fire-and-forget side effects after a batch invite: per reviewer, send the
 * invite email + (for platform users) an in-app notification, and (for external
 * email-only invitees) capture a marketing lead so we can follow up about
 * joining. Never blocks or fails the request — each effect is best-effort.
 */
export async function fireInviteSideEffects(
  ownerId: string,
  reviews: ResumeReviewDTO[],
  expiresInHours: number | undefined,
): Promise<void> {
  const withReviewer = reviews.filter((r) => r.reviewerId || r.reviewerEmail);
  if (withReviewer.length === 0) return;
  const repos = buildRepos(getDb());

  const { actor: ownerActor, actorName: ownerName } = await resolveActor({ repos }, ownerId);

  // Resume title (all reviews here share one resume) for the email subject/body.
  const resumeId = reviews[0]?.resumeId;
  let itemTitle = "their resume";
  if (resumeId) {
    const row = await repos.resumes.findById(resumeId);
    if (row?.title) itemTitle = row.title;
  }
  const expiryLabel = humanExpiry(expiresInHours);

  // Resolve emails for platform-user invitees in one batch (no N+1).
  const userIds = withReviewer.map((r) => r.reviewerId).filter((x): x is string => !!x);
  const users = userIds.length ? await repos.users.findManyByIds(userIds) : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  for (const review of withReviewer) {
    const user = review.reviewerId ? userById.get(review.reviewerId) : undefined;
    const email = user?.email ?? review.reviewerEmail ?? null;
    const recipientName = review.reviewerName ?? user?.name ?? "there";
    const reviewUrl = review.shareToken ? buildReviewUrl(review.shareToken) : "";

    if (email && reviewUrl) {
      await sendReviewInviteEmail({
        to: email,
        recipientName,
        senderName: ownerName,
        reviewUrl,
        itemTitle,
        itemLabel: "resume",
        message: review.message,
        expiryLabel,
      }).catch((err) => logger.error("[resume-feedback] invite email failed", err));
    }

    if (review.reviewerId) {
      // Platform user — drop an in-app notification into their inbox/bell.
      await emitNotification(
        { repos },
        {
          recipientIds: [review.reviewerId],
          type: "review_requested",
          actor: ownerActor,
          title: `${ownerName} asked you to review their resume`,
          message: `${ownerName} would like your feedback on "${itemTitle}".`,
          target: { id: review.id, type: "resume_review" },
          url: `/resume-review/${review.id}`,
        },
      ).catch((err) => logger.error("[resume-feedback] invite notification failed", err));
    } else if (email) {
      // External invitee with no account — capture as a marketing lead so we
      // can follow up about joining (they gave feedback without signing up).
      await captureReviewerLead(repos, email, recipientName).catch((err) =>
        logger.error("[resume-feedback] lead capture failed", err),
      );
    }
  }
}

/**
 * Fire-and-forget side effects after a reviewer hands feedback back: notify the
 * owner (inbox/bell) and capture the reviewer as a lead if they're an external
 * guest with no account. Best-effort; never fails the submit.
 */
export async function fireSubmitSideEffects(review: ResumeReviewDTO): Promise<void> {
  const repos = buildRepos(getDb());
  const reviewerLabel = review.reviewerName ?? review.reviewerEmail ?? "A reviewer";
  const actor = review.reviewerId
    ? (await resolveActor({ repos }, review.reviewerId)).actor
    : null;
  await emitNotification(
    { repos },
    {
      recipientIds: [review.ownerId],
      type: "review_submitted",
      actor,
      title: `${reviewerLabel} left feedback on your resume`,
      message: `${reviewerLabel} submitted feedback${review.title ? ` on "${review.title}"` : ""}.`,
      target: { id: review.id, type: "resume_review" },
      url: `/resume-review/${review.id}`,
    },
  ).catch((err) => logger.error("[resume-feedback] submit notification failed", err));
  if (!review.reviewerId && review.reviewerEmail) {
    await captureReviewerLead(repos, review.reviewerEmail, review.reviewerName).catch((err) =>
      logger.error("[resume-feedback] submit lead capture failed", err),
    );
  }
}

/** Idempotently record an external reviewer's email as a top-of-funnel lead. */
async function captureReviewerLead(
  repos: ReturnType<typeof buildRepos>,
  email: string,
  name: string | null,
): Promise<void> {
  const existing = await repos.marketing.findMarketingLeadByEmail(email.toLowerCase());
  if (existing) return;
  await repos.marketing.insertMarketingLead({
    email: email.toLowerCase(),
    name: name && name !== "there" ? name : null,
    source: "resume_review_invite",
    status: "new",
  } as any);
}
