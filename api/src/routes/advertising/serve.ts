/**
 * #2396 — Serve one active internal creative for a named page slot.
 * Slot keys match InternalAdSlot (`dashboard-banner`, …). Viewer auth
 * is required (the advertising mount is behind JWT) but the row is NOT
 * owner-filtered — ads are shown TO the current user.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { serveAdForSlot } from "../../services/advertising/promotion.js";
import { success, error } from "../../types/index.js";

export const advertisingServeRoutes = new Hono<AppEnv>();

advertisingServeRoutes.get("/serve", async (c) => {
  const slot = (c.req.query("slot") ?? "").trim();
  if (!slot) {
    return c.json(
      error("VALIDATION_ERROR", "slot is required"),
      400,
    );
  }

  return c.json(success(await serveAdForSlot(slot)));
});
