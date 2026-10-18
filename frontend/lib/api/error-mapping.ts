/**
 * Error mapping: turn a non-2xx / `success: false` API body into the typed
 * AppError the callers catch (plus the auth side effects some codes carry).
 */
import type { ApiErrorResponse } from "@shared/api";
import { validateApiResponse, ApiErrorResponseSchema } from "@shared/api";
import i18next from "i18next";
import type { AppError } from "../errors";
import {
  NetworkError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  UnverifiedAccountError,
  RateLimitError,
  AIUsageLimitError,
} from "../errors";
import { EXPLICIT_CONTENT_CODE, explicitContentMessage, explicitInfoFrom } from "../moderation/explicit-content-error";
import { getAuthToken, REFRESH_TOKEN_KEY, AUTH_TOKEN_KEY } from "./auth-token";
import { truncateBodyForLog } from "./request-log";

/** Usage / upgrade numbers a limit response carries on its `data` block. */
interface UsageLimitData {
  upgradeUrl?: string;
  used?: number;
  limit?: number;
  remaining?: number;
}

/** TOKEN_BUDGET_EXCEEDED's `error.budget` block (monthly* names). */
interface TokenBudgetBlock {
  monthlyUsed?: number;
  monthlyLimit?: number;
  totalAvailable?: number;
}

type WithUsageData = ApiErrorResponse & { data?: UsageLimitData };

/** A raw 429 body — either the usage-limit `error` shape or the plain one. */
interface RateLimitBody {
  message?: string;
  error?: {
    code?: string;
    message?: string;
    upgradeUrl?: string;
    usage?: { used?: number; limit?: number };
  };
  data?: UsageLimitData;
}

/**
 * Some upstream error responses use a loose `{ error: { code, message, ... } }`
 * shape WITHOUT a `success: false` envelope — notably anything thrown from
 * the API's globalErrorHandler (e.g. drizzle "relation does not exist"
 * surfacing as INTERNAL_ERROR). Without this extractor we'd fail strict
 * schema validation and fall through to a generic
 * `new NetworkError("HTTP 500: Request failed")`, dropping the actionable
 * server code, message, and `_source` stack frame.
 */
function extractLooseErrorEnvelope(
  data: unknown,
): { code: string; message: string; details: Record<string, unknown> } | null {
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  const errObj = (data as { error: unknown }).error;
  if (!errObj || typeof errObj !== "object") return null;
  const e = errObj as Record<string, unknown>;
  if (typeof e.code !== "string" || typeof e.message !== "string") return null;

  const baseDetails =
    e.details && typeof e.details === "object" && !Array.isArray(e.details)
      ? (e.details as Record<string, unknown>)
      : {};
  const details: Record<string, unknown> = { ...baseDetails };
  // Preserve `_source` (server-side stack frame) and any sibling diagnostic
  // fields so SuperAdmin can see the originating function/file/line.
  for (const [key, value] of Object.entries(e)) {
    if (key === "code" || key === "message" || key === "details") continue;
    details[key] = value;
  }
  return { code: e.code, message: e.message, details };
}

/**
 * Tear down auth state and redirect — but only when the caller actually had
 * a session. An anonymous visitor calling an auth-required side endpoint
 * (e.g. /resumes/<id> firing a follow-up analytics fetch) must NOT be
 * redirected; the page should keep rendering and the caller can swallow
 * the AuthenticationError. Without this gate, any public page that fires
 * an auxiliary auth-required call bounces anonymous visitors to /login.
 *
 * Returns true when a session was torn down, false when the caller was
 * already anonymous and nothing happened.
 */
function handleSessionInvalidation(): boolean {
  const hadToken = !!getAuthToken();
  if (!hadToken) return false;

  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem("current_user");
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.dispatchEvent(new CustomEvent("auth-logout"));
  setTimeout(() => {
    window.location.replace("/");
  }, 100);
  return true;
}

export function handleErrorResponse(status: number, data: unknown): never {

  // Try to parse as API error response
  const errorValidation = validateApiResponse(data, ApiErrorResponseSchema);

  if (errorValidation.success) {
    throw createErrorFromResponse(errorValidation.data, status);
  }

  // Loose envelope: `{ error: { code, message, ... } }` with no `success`
  // field. The API's globalErrorHandler returns this shape for unhandled
  // exceptions (incl. the `_source` stack frame), and previously we'd
  // collapse it to "HTTP 500: Request failed" — dropping every actionable
  // detail. Forward to createErrorFromResponse so callers see the real
  // code, message, and diagnostics.
  const loose = extractLooseErrorEnvelope(data);
  if (loose) {
    throw createErrorFromResponse({ success: false, error: loose }, status);
  }

  // Note: ACCOUNT_DELETED errors are handled in createErrorFromResponse
  // since they come as structured API responses with success: false

  // Fallback to HTTP status-based errors
  switch (status) {
    case 401:
      handleSessionInvalidation();
      throw new AuthenticationError("Authentication required");
    case 403:
      throw new AuthorizationError("Access forbidden");
    case 404:
      throw new NotFoundError("Resource not found");
    case 429: {
      // Rate limit exceeded - try to extract details from data
      const rlData = data as RateLimitBody | null | undefined;
      const errorCode = rlData?.error?.code;
      // If the server sent USAGE_LIMIT_EXCEEDED, surface it as AIUsageLimitError
      if (errorCode === "USAGE_LIMIT_EXCEEDED" || errorCode === "AI_USAGE_LIMIT_REACHED") {
        const usageInfo: { used?: number; limit?: number } = rlData?.error?.usage || {};
        throw new AIUsageLimitError(
          rlData?.error?.message || "AI usage limit exceeded",
          rlData?.error?.upgradeUrl || "/pricing",
          usageInfo.used,
          usageInfo.limit,
        );
      }
      throw new RateLimitError(
        rlData?.message || "Rate limit exceeded",
        rlData?.data?.upgradeUrl,
        rlData?.data?.used,
        rlData?.data?.limit,
        rlData?.data?.remaining,
      );
    }
    default:
      // Preserve the raw response body so the dev toast can still show
      // whatever the server emitted, even if it doesn't match either
      // envelope shape.
      throw new NetworkError(`HTTP ${status}: Request failed`, undefined, {
        httpStatus: status,
        responseBody: truncateBodyForLog(data),
      });
  }
}

export function createErrorFromResponse(errorResponse: ApiErrorResponse, httpStatus?: number): AppError {
  const { error } = errorResponse;

  switch (error.code) {
    case "VALIDATION_ERROR":
      return new ValidationError(error.message, undefined, error.details);
    case "ACCOUNT_UNVERIFIED":
    case "EMAIL_NOT_VERIFIED":
      // Broadcast so AuthProvider can flip isEmailVerified and the global
      // gate can take over. Do NOT clear auth or redirect here.
      try {
        window.dispatchEvent(new CustomEvent("auth-email-unverified"));
      } catch {
        // no-op (SSR / non-browser)
      }
      return new UnverifiedAccountError(error.message, error.details);
    case "AI_USAGE_LIMIT_REACHED":
    case "USAGE_LIMIT_EXCEEDED":
    case "TOKEN_BUDGET_EXCEEDED": {
      // AI usage limit exceeded - extract upgrade info from data. The
      // per-user TOKEN_BUDGET_EXCEEDED case (#528) carries the limit
      // numbers on `error.budget`; vendor-plan paths put them on `data`.
      // Both land on AIUsageLimitError so `<GlobalAIUsageBanner>` and
      // `<GlobalErrorHandler>` agree on the upgrade-prompt path.
      const aiData: UsageLimitData = (errorResponse as WithUsageData).data || {};
      const budget: TokenBudgetBlock = (error as typeof error & { budget?: TokenBudgetBlock }).budget || {};
      return new AIUsageLimitError(
        error.message,
        aiData.upgradeUrl || "/pricing",
        // TOKEN_BUDGET_EXCEEDED's budget block uses monthly* names
        // (domains/billing/token-ledger.ts buildTokenBudgetExceededResponse).
        aiData.used ?? budget.monthlyUsed,
        aiData.limit ?? budget.monthlyLimit,
        aiData.remaining ?? budget.totalAvailable,
        error.details,
      );
    }
    case "RATE_LIMIT_EXCEEDED":
      // General rate limit exceeded
      const rateLimitData: UsageLimitData = (errorResponse as WithUsageData).data || {};
      return new RateLimitError(
        error.message,
        rateLimitData.upgradeUrl || "/pricing",
        rateLimitData.used,
        rateLimitData.limit,
        rateLimitData.remaining,
        error.details,
      );
    case "AUTHENTICATION_ERROR":
    case "UNAUTHORIZED":
    case "ACCOUNT_DELETED":
      handleSessionInvalidation();
      return new AuthenticationError(error.message, error.details);
    case "AUTHORIZATION_ERROR":
      return new AuthorizationError(error.message, error.details);
    case "NOT_FOUND":
    case "NOT_FOUND_ERROR":
    case "RESUME_PRIVATE": {
      // Preserve the server-sent code in context so callers can distinguish
      // "doesn't exist" from "exists but restricted" (e.g. private resumes).
      const detailsObj = error.details && typeof error.details === "object" ? error.details : {};
      return new NotFoundError(error.message, { ...detailsObj, serverCode: error.code });
    }
    default: {
      // Stash the server's original error code AND the real HTTP status
      // in context. Without httpStatus the toast would always read "500"
      // because NetworkError hardcodes 500 — a 402 quota rejection from
      // the upload route then misleadingly reads as a server crash. The
      // dispatched event prefers `httpStatus` from context when present.
      const detailsObj =
        error.details && typeof error.details === "object" ? error.details : {};
      // Explicit-content gate: never surface the API's English sentence —
      // rebuild it from the category ids in the viewer's language.
      const message = error.code === EXPLICIT_CONTENT_CODE
        ? explicitContentMessage(explicitInfoFrom(detailsObj), (key, opts) => String(i18next.t(key, opts)), i18next.language || "en")
        : error.message;
      return new NetworkError(message, undefined, {
        ...detailsObj,
        serverCode: error.code,
        httpStatus,
      });
    }
  }
}
