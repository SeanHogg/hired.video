/**
 * Response helpers shared by the /api/recruiter sub-routers. The recruiter
 * CRM grew three response dialects that clients depend on, so each is kept
 * byte-for-byte:
 *   • `responseEnvelope(data)` — `{ success, data, errorMessage, errorCode }`
 *     (placements, submissions, bulk ops, agent).
 *   • `success(data)` / `error(...)` from types/index (talent pool, lists,
 *     sequences, match, extraction).
 *   • bare `{ success:false, error:{ code, message, details? } }` (no
 *     timestamp) on a handful of legacy validation paths.
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { error } from "../../types/index.js";
import { isDomainError, type DomainError } from "../../domains/errors.js";

export const responseEnvelope = <T>(data: T) => ({
  success: true,
  data,
  errorMessage: null,
  errorCode: null,
});

/** Legacy error body without timestamp/_source. */
export function bareError(code: string, message: string, details?: unknown) {
  return { success: false, error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

export type ErrorDialect = "envelope" | "bare";

function renderDomainError(c: Context, err: DomainError, dialect: ErrorDialect): Response {
  const body = dialect === "bare" ? bareError(err.code, err.message, err.details) : error(err.code, err.message, err.details);
  return c.json(body, err.status as ContentfulStatusCode);
}

/**
 * Run a use case; a thrown DomainError renders in the route's error
 * dialect, anything else propagates to the global error handler.
 */
export async function handle(
  c: Context,
  dialect: ErrorDialect,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (isDomainError(err)) return renderDomainError(c, err, dialect);
    throw err;
  }
}
