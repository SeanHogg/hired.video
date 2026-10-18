/**
 * SuperAdmin email-campaign manager. Mounted at /api/admin/campaigns by the
 * admin composite (routes/admin/index.ts), which applies the SA guard.
 *
 * The full campaign engine for marketing blasts: compose from a template or
 * inline body, pick an audience (platform users by role / marketing leads /
 * explicit list), preview the audience size, schedule (or send-now), and
 * manage the shared email-template library. Every send is attributed to the
 * hired.video platform company. All mutations are audit-logged.
 *
 * Reuses CampaignService — the same engine that drives the user-facing
 * Outreach campaigns and the cron send loop.
 *
 *   GET    /                       — list campaigns (+ stats)
 *   POST   /                       — create a campaign
 *   GET    /:id                    — one campaign
 *   PATCH  /:id                    — update a draft
 *   POST   /:id/schedule           — schedule / send-now
 *   POST   /:id/pause              — pause an in-flight / scheduled campaign
 *   POST   /:id/cancel             — cancel
 *   POST   /audience/preview       — dry-run audience size + sample
 *   GET    /templates              — list email templates
 *   POST   /templates              — create a template
 *   PATCH  /templates/:id          — update a template
 *   DELETE /templates/:id          — delete a template
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { adminCampaignService as buildService, createPlatformCampaign } from "../services/admin/adminCampaigns.js";
import { recordAdminAudit } from "../services/admin/adminAudit.js";
import { z } from "zod";
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  ScheduleCampaignSchema,
  CreateTemplateSchema,
  UpdateTemplateSchema,
  CampaignAudienceSchema,
} from "../../../shared/campaigns.js";
import { MARKETING_CATEGORIES } from "../../../shared/email-consent.js";
import { validateJson } from "./helpers/validate.js";

export const adminCampaignRoutes = new Hono<AppEnv>();

function audit(actorId: string, action: string, targetId: string, metadata: Record<string, unknown>) {
  return recordAdminAudit({ actorId, action, targetType: "email_campaign", targetId, metadata });
}

// ── Campaigns ────────────────────────────────────────────────────────────────
adminCampaignRoutes.get("/", async (c) => {
  return c.json(success(await buildService().list()), 200);
});

adminCampaignRoutes.post("/", validateJson(CreateCampaignSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  const actorId = c.var.userId;
  const created = await createPlatformCampaign(body, actorId);
  await audit(actorId, "campaign.create", created.id, { name: created.name });
  return c.json(success(created), 201);
});

adminCampaignRoutes.get("/templates", async (c) => {
  return c.json(success(await buildService().listTemplates()), 200);
});

adminCampaignRoutes.post("/templates", validateJson(CreateTemplateSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  const actorId = c.var.userId;
  const created = await buildService().createTemplate(body);
  await audit(actorId, "campaign_template.create", created.id, { name: created.name });
  return c.json(success(created), 201);
});

adminCampaignRoutes.patch("/templates/:id", validateJson(UpdateTemplateSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  const id = c.req.param("id");
  const updated = await buildService().updateTemplate(id, body);
  if (!updated) return c.json(error("NOT_FOUND", "Template not found"), 404);
  await audit(c.var.userId, "campaign_template.update", id, {});
  return c.json(success(updated), 200);
});

adminCampaignRoutes.delete("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await buildService().deleteTemplate(id);
  if (!ok) return c.json(error("NOT_FOUND", "Template not found"), 404);
  await audit(c.var.userId, "campaign_template.delete", id, {});
  return c.json(success({ id, deleted: true }), 200);
});

const PreviewSchema = z.object({
  audience: CampaignAudienceSchema,
  category: z.enum(MARKETING_CATEGORIES).optional(),
});

adminCampaignRoutes.post("/audience/preview", validateJson(PreviewSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid audience")), async (c) => {
  const body = c.req.valid("json");
  return c.json(
    success(await buildService().previewAudience(body.audience, body.category)),
    200,
  );
});

adminCampaignRoutes.get("/:id", async (c) => {
  const dto = await buildService().get(c.req.param("id"));
  if (!dto) return c.json(error("NOT_FOUND", "Campaign not found"), 404);
  return c.json(success(dto), 200);
});

adminCampaignRoutes.patch("/:id", validateJson(UpdateCampaignSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  const id = c.req.param("id");
  const updated = await buildService().update(id, body);
  if (!updated) return c.json(error("NOT_FOUND", "Campaign not found"), 404);
  await audit(c.var.userId, "campaign.update", id, {});
  return c.json(success(updated), 200);
});

adminCampaignRoutes.post("/:id/schedule", validateJson(ScheduleCampaignSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  const id = c.req.param("id");
  const result = await buildService().schedule(id, body.scheduledAt ?? null);
  if (result.ok && result.campaign) {
    await audit(c.var.userId, "campaign.schedule", id, {
      scheduledAt: body.scheduledAt ?? "now",
    });
    return c.json(success(result.campaign), 200);
  }
  return c.json(error("VALIDATION_ERROR", result.reason ?? "Cannot schedule campaign"), 400);
});

adminCampaignRoutes.post("/:id/pause", async (c) => {
  const id = c.req.param("id");
  const updated = await buildService().setStatus(id, "paused");
  if (!updated) return c.json(error("NOT_FOUND", "Campaign not found"), 404);
  await audit(c.var.userId, "campaign.pause", id, {});
  return c.json(success(updated), 200);
});

adminCampaignRoutes.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const updated = await buildService().setStatus(id, "cancelled");
  if (!updated) return c.json(error("NOT_FOUND", "Campaign not found"), 404);
  await audit(c.var.userId, "campaign.cancel", id, {});
  return c.json(success(updated), 200);
});

export default adminCampaignRoutes;
