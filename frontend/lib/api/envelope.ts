/**
 * Response-envelope handling: read a body as JSON (with diagnostics on a
 * non-JSON failure), map a `{ success, data }` envelope onto the typed
 * success response (token-budget + badge side channels included), and
 * validate the bodies of raw (non-envelope) endpoints.
 */
import type { z } from "zod";
import type { ApiErrorResponse, ApiSuccessResponse } from "@shared/api";
import { validateApiResponse, ApiResponseSchema } from "@shared/api";
import { NetworkError, ValidationError } from "../errors";
import { signalBadgeRefresh } from "../badges/refresh";
import { createErrorFromResponse, handleErrorResponse } from "./error-mapping";

/** Cap on the non-JSON body snippet we attach to an error report — enough to
 *  carry the Cloudflare ray id / error-page title without bloating the report. */
const MAX_NONJSON_BODY_SNIPPET = 1024;

/**
 * Read a response body as JSON. Reads the raw text first so that, when the body
 * ISN'T valid JSON (an HTML 502/504 from the edge, a truncated gateway page),
 * we can attach the real HTTP status + a capped snippet of the ACTUAL body to
 * the NetworkError. That snippet (Cloudflare ray id, gateway error-page title)
 * is the single most diagnostic bit for an edge/gateway failure — without it
 * these collapse into an opaque "Invalid JSON response" with a fabricated 500,
 * leaving the emailed error report with nothing to act on. Single source of
 * truth for "parse the body, or fail with diagnostics" so handleResponse /
 * getRaw / requestRaw can't drift on what context a non-JSON failure carries.
 */
export async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new NetworkError(
      "Invalid JSON response",
      error instanceof Error ? error : undefined,
      {
        httpStatus: response.status,
        statusText: response.statusText,
        bodyText: text.slice(0, MAX_NONJSON_BODY_SNIPPET),
      },
    );
  }
}

/**
 * Broadcast a piggy-backed token-budget envelope so the AI-tokens pill
 * updates without a second round-trip. Returns whether `raw` was a budget.
 * Shared by the JSON envelope path and streamed endpoints (which carry the
 * budget on their final event).
 */
export function broadcastTokenBudget(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("token-budget:update", { detail: raw }));
    } catch {
      // Non-DOM environment (tests, SSR); skip.
    }
  }
  return true;
}

/** Map an already-parsed body (read ONCE by the caller, which also logs
 *  it) onto the typed success envelope, or throw the typed error. */
export async function toSuccessEnvelope<T>(
  response: Response,
  responseData: unknown,
  schema?: z.ZodType<T>,
): Promise<ApiSuccessResponse<T>> {
  if (!response.ok) {
    return handleErrorResponse(response.status, responseData);
  }

  const validationResult = validateApiResponse(
    responseData,
    ApiResponseSchema,
  );
  if (!validationResult.success) {
    const errorMessage =
      "error" in validationResult
        ? validationResult.error
        : "Unknown validation error";
    throw new ValidationError(
      `Invalid API response structure: ${errorMessage}`,
    );
  }

  const apiResponse = validationResult.data;
  if (!apiResponse.success) {
    throw createErrorFromResponse(apiResponse as ApiErrorResponse);
  }

  const successResponse: ApiSuccessResponse<T> = {
    success: true,
    data: apiResponse.data as T,
    message: apiResponse.message,
    timestamp: apiResponse.timestamp,
  };

  // Piggy-back token-budget envelope — AI-metered endpoints include a
  // `tokenBudget` field on every response so the AI-tokens pill updates
  // in real time without a second round-trip. Preserve it on the typed
  // response AND broadcast via a window event so hooks/components can
  // react without prop drilling.
  const rawBudget = (apiResponse as { tokenBudget?: unknown }).tokenBudget;
  if (broadcastTokenBudget(rawBudget)) {
    successResponse.tokenBudget = rawBudget as ApiSuccessResponse<T>["tokenBudget"];
  }

  // #1135 — any award-firing endpoint that echoes `badgesUnlocked`
  // (top-level or on its data payload) triggers an immediate badge-list
  // refresh, so the unlock celebration fires within the same render cycle.
  // DRY seam: routes opt in just by returning the field.
  const unlocked =
    (apiResponse as { badgesUnlocked?: unknown }).badgesUnlocked ??
    (apiResponse.data as { badgesUnlocked?: unknown } | null | undefined)?.badgesUnlocked;
  if (Array.isArray(unlocked) && unlocked.length > 0) {
    signalBadgeRefresh();
  }

  if (schema) {
    const dataValidation = validateApiResponse(successResponse.data, schema);
    if (!dataValidation.success) {
      const errorMessage =
        "error" in dataValidation
          ? dataValidation.error
          : "Unknown validation error";
      console.error(
        "ApiClient.handleResponse: Data validation failed",
        errorMessage,
        successResponse.data,
      );
      throw new ValidationError(`Invalid response data: ${errorMessage}`);
    }
    successResponse.data = dataValidation.data;
  }

  return successResponse;
}

/**
 * Validate a raw (non-envelope) body against an optional schema. Shared by
 * getRaw / requestRaw.
 */
export function parseRawData<T>(responseData: unknown, schema?: z.ZodSchema<T>): { data: T } {
  if (schema) {
    // `nullToUndefined` removed 2026-04-20 — the canonical shared
    // schemas use `.nullable()` which accepts `T | null`, not
    // `T | undefined`. Preprocessing was breaking them.
    const validation = schema.safeParse(responseData);
    if (!validation.success) {
      throw new ValidationError(
        `Invalid response data: ${validation.error.issues.map((i) => i.message).join(", ")}`,
      );
    }
    return { data: validation.data };
  }

  return { data: responseData as T };
}
