/**
 * Production wiring for PlanOverrideDeps. Builds the real adapters —
 * repositories for user + subscription data and the fire-and-forget
 * audit logger.
 *
 * Tests never import this file; they build deps with hand-rolled fakes
 * directly (see plan-override-handlers.test.ts).
 */

import { getDb } from "../../db/index.js";
import { auditLog } from "../../utils/audit.js";
import { buildRepos } from "../../repositories/index.js";
import { invalidateSubscriptionCache } from "../billing/BillingService.js";
import type {
  AuditPort,
  PlanCachePort,
  PlanOverrideDeps,
} from "./plan-override-handlers.js";

const audit: AuditPort = { log: auditLog };
const cache: PlanCachePort = {
  invalidateForUser: invalidateSubscriptionCache,
};

export function buildPlanOverrideDeps(): PlanOverrideDeps {
  const repos = buildRepos(getDb());
  return {
    users: repos.users,
    subscriptions: repos.subscriptions,
    audit,
    cache,
    now: () => new Date(),
  };
}
