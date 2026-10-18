/**
 * Saved-search job alerts (caller-scoped):
 *
 *   GET    /alerts              list
 *   POST   /alerts              create
 *   PUT    /alerts/:id          update
 *   PATCH  /alerts/:id/toggle   toggle active
 *   DELETE /alerts/:id          delete
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import * as jobService from "../../services/job/JobService.js";
import { JobAlertSchema } from "./schemas.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

export const jobAlertRoutes = new Hono<AppEnv>();

jobAlertRoutes.get("/alerts", async (c) => {
  const userId = requireUser(c);
  const alerts = await jobService.getJobAlerts(userId);
  return c.json(success(alerts));
});

jobAlertRoutes.post("/alerts", validateJson(JobAlertSchema, () => error("VALIDATION_ERROR", "Invalid request body"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const alert = await jobService.createJobAlert(userId, body);
  return c.json(success(alert), 201);
});

jobAlertRoutes.put("/alerts/:id", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const alert = await jobService.updateJobAlert(c.req.param("id"), userId, body);
  if (!alert) return c.json(error("NOT_FOUND", "Alert not found"), 404);
  return c.json(success(alert));
});

jobAlertRoutes.patch("/alerts/:id/toggle", async (c) => {
  const userId = requireUser(c);
  const alert = await jobService.toggleJobAlert(c.req.param("id"), userId);
  if (!alert) return c.json(error("NOT_FOUND", "Alert not found"), 404);
  return c.json(success(alert));
});

jobAlertRoutes.delete("/alerts/:id", async (c) => {
  const userId = requireUser(c);
  await jobService.deleteJobAlert(c.req.param("id"), userId);
  return c.json(success({ success: true }));
});
