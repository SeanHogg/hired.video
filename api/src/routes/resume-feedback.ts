/**
 * /api/resume-feedback/* — career coaching & resume feedback (#1946).
 *
 * Owner endpoints (authenticated):
 *   POST   /reviews                         create a review (share a resume)
 *   GET    /reviews                         reviews I own
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
  CreateAnnotationInputSchema,
  UpdateAnnotationInputSchema,
  SubmitReviewInputSchema,
  ProposeDraftInputSchema,
} from "../../../shared/resume-feedback.js";
import {
  withGamification,
  gamificationFromContext,
} from "../domains/gamification/with-gamification.js";

export const resumeFeedbackRoutes = new Hono<AppEnv>();

const buildService = () => new ResumeFeedbackService(defaultResumeFeedbackServiceDeps());

function uid(c: Context): string | null {
  return ((c.var as any).user?.sub as string | undefined) ?? null;
}

function tokenOf(c: Context): string | undefined {
  return c.req.query("token") ?? undefined;
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

resumeFeedbackRoutes.get("/reviews", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    return c.json(success(await buildService().listOwnerReviews(userId)), 200);
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
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  const parsed = SubmitReviewInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid payload"), 400);
  try {
    const dto = await buildService().submitReview(c.req.param("id"), userId, parsed.data);
    // #1952 — reward the reviewer for completing a peer review (Mentor badge).
    await withGamification(c, "feedback.review.submitted", (game, role, reviewerId) =>
      game.onFeedbackReviewSubmitted({ userId: reviewerId, role, reviewId: c.req.param("id") }),
    );
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
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  try {
    const list = await buildService().listAnnotations(c.req.param("id"), userId, tokenOf(c));
    return c.json(success(list), 200);
  } catch (e) {
    return mapError(c, e);
  }
});

resumeFeedbackRoutes.post("/reviews/:id/annotations", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in required"), 401);
  const parsed = CreateAnnotationInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid annotation payload"), 400);
  try {
    const created = await buildService().createAnnotation(
      c.req.param("id"),
      userId,
      parsed.data,
      tokenOf(c),
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
