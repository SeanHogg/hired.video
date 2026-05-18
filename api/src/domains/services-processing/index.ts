// Public surface of the Services Processing domain. Every metered or gated
// consumption event in hired.video should route through this module.
//
//   import { servicesProcessor, requireEntitlement } from "../domains/services-processing/index.js";
//
//   await requireEntitlement({ user, eventType: "saved_search" });
//   // … create the saved search …
//   await servicesProcessor.meter({ userId: user.sub, eventType: "saved_search" });
//
// See [services-processor.ts](./services-processor.ts) for the full contract
// and [entitlement-catalog.ts](./entitlement-catalog.ts) for the plan-tier
// limits the gate consults.

export {
  servicesProcessor,
  requireEntitlement,
  EntitlementExceededError,
  startOfMonthUtc,
  endOfMonthUtc,
} from "./services-processor.js";
export type {
  GateArgs,
  GateResult,
  MeterArgs,
  ServicesProcessor,
} from "./services-processor.js";
export {
  ENTITLEMENT_CATALOG,
  getEntitlement,
  listEntitlements,
} from "./entitlement-catalog.js";
export type { EntitlementSpec } from "./entitlement-catalog.js";
export { closeMonthForUser, runMonthClose } from "./month-close.js";
