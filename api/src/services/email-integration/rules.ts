/**
 * Server-side re-export of the shared Stage-1 classifier rules.
 *
 * The actual rules engine lives in `shared/email-classification/` so
 * the client-driven PWA sync runs the exact same matchers — see
 * docstring at the top of that module. This file exists only so the
 * server-side callers don't have to reach across the workspace
 * boundary with relative paths.
 */

export {
  classifyByRules,
  DEFAULT_RULES,
  type RuleCondition,
  type UserRule,
} from "../../../../shared/email-classification/index.js";

export type {
  ClassificationResult,
  EmailCategory,
} from "../../../../shared/email-classification/index.js";
