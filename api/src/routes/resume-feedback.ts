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
 * Auth + ownership live in the service (its ResumeFeedbackServiceError is a
 * DomainError rendered by the global handler); this file only routes.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  ResumeFeedbackService,
  defaultResumeFeedbackServiceDeps,
} from "../services/resume-feedback/index.js";
import { fireInviteSideEffects, fireSubmitSideEffects } from "../services/resume-feedback/review-side-effects.js";
import {
  CreateReviewInputSchema,
  InviteReviewersInputSchema,
  CreateAnnotationInputSchema,
  UpdateAnnotationInputSchema,
  SubmitReviewInputSchema,
  ProposeDraftInputSchema,
} from "../../../shared/resume-feedback.js";
import {
  withGamification,
  gamificationFromContext,
} from "../domains/gamification/with-gamification.js";
import { logger } from "../lib/logger.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const resumeFeedbackRoutes = new Hono<AppEnv>();

const buildService = () => new ResumeFeedbackService(defaultResumeFeedbackServiceDeps());

function uid(c: Context): string | null {
  return ((c.var as any).user?.sub as string | undefined) ?? null;
}

function tokenOf(c: Context): string | undefined {
  return c.req.query("token") ?? undefined;
}

// ── Owner: reviews ────────────────────────────────────────────────────────────

resumeFeedbackRoutes.post("/reviews", validateJson(CreateReviewInputSchema, () => error("VALIDATION_ERROR", "Invalid review payload")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const review = await buildService().createReview(userId, body);
  return c.json(success(review), 201);
});

resumeFeedbackRoutes.post("/reviews/invite", validateJson(InviteReviewersInputSchema, () => error("VALIDATION_ERROR", "Invalid invite payload")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const reviews = await buildService().inviteReviewers(userId, body);
  // Best-effort fan-out — emails + notifications + lead capture. Don't block
  // (or fail) the response on a flaky provider.
  void fireInviteSideEffects(userId, reviews, body.expiresInHours).catch((err) =>
    logger.error("[resume-feedback] invite side effects failed", err),
  );
  return c.json(success(reviews), 201);
});

resumeFeedbackRoutes.get("/reviews", async (c) => {
  const userId = requireUser(c);
  // `?resumeId=` scopes to the per-resume feedback-session manager; otherwise
  // returns every review I own (the Communication Hub "Reviews" tab).
  const resumeId = c.req.query("resumeId");
  const reviews = resumeId
    ? await buildService().listResumeReviews(userId, resumeId)
    : await buildService().listOwnerReviews(userId);
  return c.json(success(reviews), 200);
});

resumeFeedbackRoutes.get("/assigned", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await buildService().listReviewerReviews(userId)), 200);
});

resumeFeedbackRoutes.get("/link/:token", async (c) => {
  const detail = await buildService().getReviewByToken(c.req.param("token"), uid(c));
  return c.json(success(detail), 200);
});

resumeFeedbackRoutes.get("/reviews/:id", async (c) => {
  const userId = requireUser(c);
  const detail = await buildService().getReviewDetail(c.req.param("id"), userId, tokenOf(c));
  return c.json(success(detail), 200);
});

resumeFeedbackRoutes.post("/reviews/:id/submit", validateJson(SubmitReviewInputSchema, () => error("VALIDATION_ERROR", "Invalid payload")), async (c) => {
  const userId = uid(c);
  const token = tokenOf(c);
  // Token guests (no account) can hand feedback back; the token is the grant.
  if (!userId && !token) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  const body = c.req.valid("json");
  const dto = await buildService().submitReview(c.req.param("id"), userId, body, token);
  // #1952 — reward the reviewer for completing a peer review (Mentor badge).
  await withGamification(c, "feedback.review.submitted", (game, role, reviewerId) =>
    game.onFeedbackReviewSubmitted({ userId: reviewerId, role, reviewId: c.req.param("id") }),
  );
  // Notify the owner + capture an external reviewer as a lead.
  void fireSubmitSideEffects(dto);
  return c.json(success(dto), 200);
});

resumeFeedbackRoutes.post("/reviews/:id/complete", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await buildService().completeReview(c.req.param("id"), userId)), 200);
});

resumeFeedbackRoutes.post("/reviews/:id/cancel", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await buildService().cancelReview(c.req.param("id"), userId)), 200);
});

// ── Annotations ───────────────────────────────────────────────────────────────

resumeFeedbackRoutes.get("/reviews/:id/annotations", async (c) => {
  const userId = uid(c);
  const token = tokenOf(c);
  if (!userId && !token) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  const list = await buildService().listAnnotations(c.req.param("id"), userId, token);
  return c.json(success(list), 200);
});

resumeFeedbackRoutes.post("/reviews/:id/annotations", validateJson(CreateAnnotationInputSchema, () => error("VALIDATION_ERROR", "Invalid annotation payload")), async (c) => {
  const userId = uid(c);
  const token = tokenOf(c);
  // Token guests (no account) can leave feedback; the token is the access grant.
  if (!userId && !token) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  const body = c.req.valid("json");
  const created = await buildService().createAnnotation(
    c.req.param("id"),
    userId,
    body,
    token,
  );
  return c.json(success(created), 201);
});

resumeFeedbackRoutes.patch("/annotations/:aid", validateJson(UpdateAnnotationInputSchema, () => error("VALIDATION_ERROR", "Invalid payload")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return c.json(success(await buildService().updateAnnotation(c.req.param("aid"), userId, body)), 200);
});

resumeFeedbackRoutes.post("/annotations/:aid/accept", async (c) => {
  const userId = requireUser(c);
  const result = await buildService().acceptAnnotation(c.req.param("aid"), userId);
  // #1952 — credit the reviewer who authored the accepted suggestion (not
  // the owner who accepted it). Resolved by id since they aren't the caller.
  if (result.reviewerId) {
    await gamificationFromContext(c)
      .onFeedbackSuggestionAccepted({ userId: result.reviewerId, annotationId: c.req.param("aid") })
      .catch(() => undefined);
  }
  return c.json(success(result), 200);
});

resumeFeedbackRoutes.delete("/annotations/:aid", async (c) => {
  const userId = requireUser(c);
  await buildService().deleteAnnotation(c.req.param("aid"), userId);
  return c.json(success({ deleted: true }), 200);
});

// ── Proposed drafts ───────────────────────────────────────────────────────────

resumeFeedbackRoutes.get("/reviews/:id/proposals", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await buildService().listProposals(c.req.param("id"), userId, tokenOf(c))), 200);
});

resumeFeedbackRoutes.post("/reviews/:id/propose", validateJson(ProposeDraftInputSchema, () => error("VALIDATION_ERROR", "Invalid draft payload")), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const proposal = await buildService().proposeDraft(c.req.param("id"), userId, body, tokenOf(c));
  return c.json(success(proposal), 201);
});

resumeFeedbackRoutes.post("/proposals/:vid/accept", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await buildService().acceptProposal(c.req.param("vid"), userId)), 200);
});

resumeFeedbackRoutes.post("/proposals/:vid/reject", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await buildService().rejectProposal(c.req.param("vid"), userId)), 200);
});
