import type { Context } from "hono";
import { error } from "../types/index.js";
import { PromotionError, type PromotionErrorKind } from "../services/promotions/promotionUseCases.js";

/** PromotionError → HTTP status, shared by the creator and SuperAdmin routes. */
const STATUS: Record<PromotionErrorKind, 403 | 404 | 409 | 422 | 503> = {
  PROJECT_NOT_FOUND: 404,
  NOT_FOUND: 404,
  VIDEO_NOT_READY: 409,
  VIDEO_UNBRANDED: 409,
  INVALID_VARIANT: 422,
  CONSENT_REQUIRED: 403,
  ALREADY_SUBMITTED: 409,
  NOT_REVIEWABLE: 409,
  LANE_NOT_READY: 503,
};

export function promotionErrorResponse(c: Context, err: unknown): Response {
  if (err instanceof PromotionError) return c.json(error(err.kind, err.message, err.details), STATUS[err.kind]);
  throw err;
}
