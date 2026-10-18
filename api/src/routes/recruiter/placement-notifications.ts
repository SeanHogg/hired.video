/**
 * /api/recruiter/placements/:id/notifications — per-placement opt-in to
 * stage-event alerts (#230; bell + pref-gated email). Owner-scoped.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import {
  listMyPlacementSubscriptions,
  subscribeToPlacementEvent,
  unsubscribeFromPlacementEvent,
} from "../../services/recruiter/placement-commission.js";
import { handle, responseEnvelope } from "./http.js";

export const placementNotificationRoutes = new Hono<AppEnv>();

// GET /placements/:id/notifications — the caller's subscriptions
placementNotificationRoutes.get("/placements/:id/notifications", async (c) => {
  const subs = await listMyPlacementSubscriptions(c.var.userId, c.req.param("id"));
  if (!subs) return c.json(responseEnvelope(null), 404);
  return c.json(responseEnvelope(subs));
});

// POST /placements/:id/notifications { event } — subscribe to a stage event
placementNotificationRoutes.post("/placements/:id/notifications", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  return handle(c, "envelope", async () => {
    const result = await subscribeToPlacementEvent(user.sub, id, body.event);
    if (!result) return c.json(responseEnvelope(null), 404);
    return c.json(responseEnvelope(result));
  });
});

// DELETE /placements/:id/notifications/:event — unsubscribe
placementNotificationRoutes.delete("/placements/:id/notifications/:event", async (c) => {
  const user = c.get("user");
  return handle(c, "envelope", async () => {
    const result = await unsubscribeFromPlacementEvent(user.sub, c.req.param("id"), c.req.param("event"));
    if (!result) return c.json(responseEnvelope(null), 404);
    return c.json(responseEnvelope(result));
  });
});
