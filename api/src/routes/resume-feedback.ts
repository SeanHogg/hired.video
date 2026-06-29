/**
 * /api/resume-feedback/* — career coaching & resume feedback (#1946).
 *
 * Owner endpoints (authenticated):
 *   POST   /reviews                         create a review (share a resume)
 *   GET    /reviews[?resumeId=]             reviews I own (optionally one resume)
 *   GET    /reviews/:id                     review detail (resume + feedback)
 *   POST   /reviews/:id/complete            close the review
 *   POST   /reviews/:id/cancel              cancel the review
 *   POST   /annotations/:aid/accept         accept a suggestion (applies edit)
 *   POST   /proposals/:vid/accept           accept a proposed draft
 *   POST   /proposals/:vid/reject           reject a proposed draft
 *
 * Reviewer endpoints (authenticated or share-token via ?token=):
 *   GET    /assigned                        reviews assigned to me
 *   GET    /link/:token                     open a share link (optional auth)
 *   POST   /reviews/:id/submit              hand feedback back
 *   POST   /reviews/:id/propose             submit a proposed full draft
 *
 * Shared (either party, scoped to the review):
 *   GET    /reviews/:id/annotations         list annotations (cached)
 *   POST   /reviews/:id/annotations         add a sticky note / highlight / comment
 *   PATCH  /annotations/:aid                edit / change status of an annotation
 *   DELETE /annotations/:aid                delete an annotation
 *   GET    /reviews/:id/proposals           list proposed drafts
 *
 * Auth + ownership live in the service; this file only routes + maps errors.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  ResumeFeedbackService,
  ResumeFeedbackServiceError,
  defaultResumeFeedbackServiceDeps,
} from "../services/resume-feedback/index.js";
import {
  CreateReviewInputSchema,
  InviteReviewersInputSchema,
  CreateAnnotationInputSchema,
  UpdateAnnotationInputSchema,
  SubmitReviewInputSchema,
  ProposeDraftInputSchema,
  type ResumeReviewDTO,
} from "../../../shared/resume-feedback.js";
import {
  withGamification,
  gamificationFromContext,
} from "../domains/gamification/with-gamification.js";
import { getDb, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { buildRepos } from "../repositories/index.js";
import { emitNotification, resolveActor } from "../services/notifications/notificationService.js";
import { sendReviewInviteEmail, buildReviewUrl } from "../services/adapters/email.js";

export const resumeFeedbackRoutes = new Hono<AppEnv>();

const buildService = () => new ResumeFeedbackService(defaultResumeFeedbackServiceDeps());

function uid(c: Context): string | null {
  return ((c.var as any).user?.sub as string | undefined) ?? null;
}

function tokenOf(c: Context): string | undefined {
  return c.req.query("token") ?? undefined;
}

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
async function fireInviteSideEffects(
  ownerId: string,
  reviews: ResumeReviewDTO[],
  expiresInHours: number | undefined,
): Promise<void> {
  const withReviewer = reviews.filter((r) => r.reviewerId || r.reviewerEmail);
  if (withReviewer.length === 0) return;
  const db = getDb();
  const repos = buildRepos(db);

  const { actor: ownerActor, actorName: ownerName } = await resolveActor({ repos }, ownerId);

  // Resume title (all reviews here share one resume) for the email subject/body.
  const resumeId = reviews[0]?.resumeId;
  let itemTitle = "their resume";
  if (resumeId) {
    const [row] = await db
      .select({ title: schema.resumeInformation.title })
      .from(schema.resumeInformation)
      .where(eq(schema.resumeInformation.id, resumeId))
      .limit(1);
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
      }).catch((err) => console.error("[resume-feedback] invite email failed:", err));
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
      ).catch((err) => console.error("[resume-feedback] invite notification failed:", err));
    } else if (email) {
      // External invitee with no account — capture as a marketing lead so we
      // can follow up about joining (they gave feedback without signing up).
      await captureReviewerLead(repos, email, recipientName).catch((err) =>
        console.error("[resume-feedback] lead capture failed:", err),
      );
    }
  }
}

/**
 * Fire-and-forget side effects after a reviewer hands feedback back: notify the
 * owner (inbox/bell) and capture the reviewer as a lead if they're an external
 * guest with no account. Best-effort; never fails the submit.
 */
async function fireSubmitSideEffects(review: ResumeReviewDTO): Promise<void> {
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
  ).catch((err) => console.error("[resume-feedback] submit notification failed:", err));
  if (!review.reviewerId && review.reviewerEmail) {
    await captureReviewerLead(repos, review.reviewerEmail, review.reviewerName).catch((err) =>
      console.error("[resume-feedback] submit lead capture failed:", err),
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

function mapError(c: Context, e: unknown) {
  if (e instanceof ResumeFeedbackServiceError) {
    const status =
      e.code === "NOT_FOUND" ? 404
      : e.code === "FORBIDDEN" ? 403
      : e.code === "INVALID_STATE" ? 409
      : e.code === "CONFLICT" ? 409
      : 400;
    return c.json(error(e.code, e.message), status as 400 | 403 | 404 | 409);
  }
  return c.json(error("INTERNAL_ERROR", "Unexpected error"), 500);
}

// ── Owner: reviews ────────────────────────────────────────────────────────────

resumeFeedbackRoutes.post("/reviews", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  const parsed = CreateReviewInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid review payload"), 400);
  try {
    const review = await buildService().createReview(userId, parsed.data);
    return c.json(success(review), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.post("/reviews/invite", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  const parsed = InviteReviewersInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid invite payload"), 400);
  try {
    const reviews = await buildService().inviteReviewers(userId, parsed.data);
    // Best-effort fan-out — emails + notifications + lead capture. Don't block
    // (or fail) the response on a flaky provider.
    void fireInviteSideEffects(userId, reviews, parsed.data.expiresInHours).catch((err) =>
      console.error("[resume-feedback] invite side effects failed:", err),
    );
    return c.json(success(reviews), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.get("/reviews", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  // `?resumeId=` scopes to the per-resume feedback-session manager; otherwise
  // returns every review I own (the Communication Hub "Reviews" tab).
  const resumeId = c.req.query("resumeId");
  try {
    const reviews = resumeId
      ? await buildService().listResumeReviews(userId, resumeId)
      : await buildService().listOwnerReviews(userId);
    return c.json(success(reviews), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.get("/assigned", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    return c.json(success(await buildService().listReviewerReviews(userId)), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.get("/link/:token", async (c) => {
  try {
    const detail = await buildService().getReviewByToken(c.req.param("token"), uid(c));
    return c.json(success(detail), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.get("/reviews/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    const detail = await buildService().getReviewDetail(c.req.param("id"), userId, tokenOf(c));
    return c.json(success(detail), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.post("/reviews/:id/submit", async (c) => {
  const userId = uid(c);
  const token = tokenOf(c);
  // Token guests (no account) can hand feedback back; the token is the grant.
  if (!userId && !token) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  const parsed = SubmitReviewInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid payload"), 400);
  try {
    const dto = await buildService().submitReview(c.req.param("id"), userId, parsed.data, token);
    // #1952 — reward the reviewer for completing a peer review (Mentor badge).
    await withGamification(c, "feedback.review.submitted", (game, role, reviewerId) =>
      game.onFeedbackReviewSubmitted({ userId: reviewerId, role, reviewId: c.req.param("id") }),
    );
    // Notify the owner + capture an external reviewer as a lead.
    void fireSubmitSideEffects(dto);
    return c.json(success(dto), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.post("/reviews/:id/complete", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    return c.json(success(await buildService().completeReview(c.req.param("id"), userId)), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.post("/reviews/:id/cancel", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    return c.json(success(await buildService().cancelReview(c.req.param("id"), userId)), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

// ── Annotations ───────────────────────────────────────────────────────────────

resumeFeedbackRoutes.get("/reviews/:id/annotations", async (c) => {
  const userId = uid(c);
  const token = tokenOf(c);
  if (!userId && !token) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    const list = await buildService().listAnnotations(c.req.param("id"), userId, token);
    return c.json(success(list), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.post("/reviews/:id/annotations", async (c) => {
  const userId = uid(c);
  const token = tokenOf(c);
  // Token guests (no account) can leave feedback; the token is the access grant.
  if (!userId && !token) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  const parsed = CreateAnnotationInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid annotation payload"), 400);
  try {
    const created = await buildService().createAnnotation(
      c.req.param("id"),
      userId,
      parsed.data,
      token,
    );
    return c.json(success(created), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.patch("/annotations/:aid", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  const parsed = UpdateAnnotationInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid payload"), 400);
  try {
    return c.json(success(await buildService().updateAnnotation(c.req.param("aid"), userId, parsed.data)), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.post("/annotations/:aid/accept", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    const result = await buildService().acceptAnnotation(c.req.param("aid"), userId);
    // #1952 — credit the reviewer who authored the accepted suggestion (not
    // the owner who accepted it). Resolved by id since they aren't the caller.
    if (result.reviewerId) {
      await gamificationFromContext(c)
        .onFeedbackSuggestionAccepted({ userId: result.reviewerId, annotationId: c.req.param("aid") })
        .catch(() => undefined);
    }
    return c.json(success(result), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.delete("/annotations/:aid", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    await buildService().deleteAnnotation(c.req.param("aid"), userId);
    return c.json(success({ deleted: true }), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

// ── Proposed drafts ───────────────────────────────────────────────────────────

resumeFeedbackRoutes.get("/reviews/:id/proposals", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    return c.json(success(await buildService().listProposals(c.req.param("id"), userId, tokenOf(c))), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.post("/reviews/:id/propose", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  const parsed = ProposeDraftInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid draft payload"), 400);
  try {
    const proposal = await buildService().proposeDraft(c.req.param("id"), userId, parsed.data, tokenOf(c));
    return c.json(success(proposal), 201);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.post("/proposals/:vid/accept", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    return c.json(success(await buildService().acceptProposal(c.req.param("vid"), userId)), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.post("/proposals/:vid/reject", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    return c.json(success(await buildService().rejectProposal(c.req.param("vid"), userId)), 200);
  } catch (e) {
    return mapError(c, e);
  }
});
