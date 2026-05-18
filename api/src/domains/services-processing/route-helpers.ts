// Route-handler ergonomics over the raw `servicesProcessor.gate()` / `.meter()`
// API. Single seam for every metered route — replaces the ~12-line "gate →
// 402 envelope → meter().catch()" boilerplate that was duplicated across
// 8+ routes after the #779/#780 wiring pass.
//
// Per the DRY rule: never re-implement the 402 envelope or the
// meter-with-catch in a route file. Both helpers self-gate (anonymous +
// admin pass through gate() automatically; meter() no-ops without a userId).
//
// Usage:
//   const blocked = await enforceEntitlement(c, "resume_tailor");
//   if (blocked) return blocked;
//   // … LLM call …
//   meterEntitlement(c, "resume_tailor", { id: result.id });
//
// The 402 message defaults to the catalog `label` + cap when `gate.reason`
// is null, so every consumer gets consistent copy without a per-route
// fallback string.

import type { Context } from "hono";
import { servicesProcessor } from "./services-processor.js";
import { getEntitlement } from "./entitlement-catalog.js";
import type { UsageEventType } from "../../../../shared/usage-statement.js";

const UPGRADE_URL = "/pricing";

/**
 * Pre-flight entitlement check.
 *
 * Returns either a `Response` (the 402 envelope to short-circuit with) when
 * the caller is over their Free-tier cap, or `null` when they're allowed
 * through. Anonymous callers and admins always get `null` (gate() handles
 * that internally).
 *
 * Callers short-circuit with one line:
 *   const blocked = await enforceEntitlement(c, "resume_roast");
 *   if (blocked) return blocked;
 */
export async function enforceEntitlement(
  c: Context,
  eventType: UsageEventType,
  quantity: number = 1,
): Promise<Response | null> {
  const gate = await servicesProcessor.gate({
    user: c.var.user,
    eventType,
    quantity,
  });
  if (gate.allowed) return null;
  const spec = getEntitlement(eventType);
  return c.json(
    {
      success: false,
      error: {
        code: "ENTITLEMENT_EXCEEDED",
        message: gate.reason ?? `${spec.label} limited to ${gate.cap} on the Free plan`,
        upgradeUrl: UPGRADE_URL,
        cap: gate.cap,
        consumed: gate.consumed,
        eventType,
      },
    },
    402,
  );
}

/**
 * Record a successful consumption event against the user's ledger.
 *
 * No-op (with a structured warn-log on failure) when:
 *   - the request has no authenticated user (anonymous metered surfaces),
 *   - the ledger write fails (a billing blip must NEVER fail the user's
 *     request — the gate has already let them through and they got the
 *     value they asked for).
 *
 * Fire-and-forget by design: returns void so callers can drop it inline
 * after a successful response build without `await` ceremony.
 */
export function meterEntitlement(
  c: Context,
  eventType: UsageEventType,
  metadata?: Record<string, unknown>,
  quantity: number = 1,
): void {
  const userId = c.var.user?.sub;
  if (!userId) return;
  void servicesProcessor
    .meter({ userId, eventType, quantity, metadata })
    .catch((err) => console.warn(`[entitlement] meter ${eventType} failed:`, err));
}
