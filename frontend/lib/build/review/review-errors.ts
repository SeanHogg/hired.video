/** Map a failed review request to the line the chat shows. The API's own
 *  error code wins (the client keeps it on `context.serverCode`). */
import { apiErrorCode } from "@/lib/errors";

const CODE_KEYS: Record<string, string> = {
  NO_APPLICABLE_CHANGES: "review.error.noChanges",
  NO_REQUIREMENTS: "review.error.noRequirements",
  NO_MASTER: "review.error.noMaster",
  AI_UNAVAILABLE: "review.error.aiBusy",
  AI_ERROR: "review.error.aiBusy",
  AI_USAGE_LIMIT_REACHED: "review.error.limit",
  USAGE_LIMIT_EXCEEDED: "review.error.limit",
  TOKEN_BUDGET_EXCEEDED: "review.error.limit",
  // 402 from the `resume_parse` gate on an OCR upload (merge/from-file, #2390).
  ENTITLEMENT_EXCEEDED: "review.error.limit",
  PRO_REQUIRED: "review.error.pro",
  AI_BAD_OUTPUT: "review.error.aiBusy",
};

export function reviewErrorKey(err: unknown): string {
  return CODE_KEYS[apiErrorCode(err)] ?? "review.error.generic";
}
