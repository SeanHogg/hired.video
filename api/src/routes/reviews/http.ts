/**
 * HTTP adapters shared by the reviews sub-routers: viewer id, subject-type
 * param parsing, and DomainError → response rendering (including the
 * PRO_REQUIRED envelope that carries `upgradeUrl`).
 */

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { isSubjectType, type SubjectType } from "../../../../shared/reviews/subject-descriptors.js";
import { DomainError } from "../../domains/errors.js";
import { ProRequiredError } from "../../services/reviews/reviewProGate.js";
import { error, type AppEnv } from "../../types/index.js";

export type ReviewsContext = Context<AppEnv>;

export function viewerId(c: ReviewsContext): string | null {
  return c.var.user?.sub ?? null;
}

/** The `:subjectType` param, or a 400 DomainError for an unknown type. */
export function subjectTypeParam(c: ReviewsContext): SubjectType {
  const raw = c.req.param("subjectType");
  if (!isSubjectType(raw)) throw new DomainError(400, "BAD_REQUEST", `Unknown subject type: ${raw}`);
  return raw;
}

/** JSON body, or null when absent / malformed (validation then 400s). */
export function readJsonBody(c: ReviewsContext): Promise<unknown> {
  return c.req.json().catch(() => null);
}

/** Run a handler body, rendering any DomainError as the standard error
 *  envelope (or the PRO_REQUIRED envelope). Other errors propagate. */
export async function handleReviews(c: ReviewsContext, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ProRequiredError) {
      return c.json(
        {
          success: false,
          error: { code: err.code, message: err.message, upgradeUrl: err.upgradeUrl },
        },
        402,
      );
    }
    if (err instanceof DomainError) {
      return c.json(error(err.code, err.message, err.details), err.status as ContentfulStatusCode);
    }
    throw err;
  }
}
