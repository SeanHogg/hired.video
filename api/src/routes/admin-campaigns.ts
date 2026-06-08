/**
 * SuperAdmin email-campaign manager. Mounted at /api/admin/campaigns.
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
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { CampaignService } from "../services/campaigns/CampaignService.js";
import { getPlatformCompanyId } from "../services/campaigns/platform-company.js";
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  ScheduleCampaignSchema,
  CreateTemplateSchema,
  UpdateTemplateSchema,
  CampaignAudienceSchema,
} from "../../../shared/campaigns.js";

const { adminAuditLog } = schema;

export const adminCampaignRoutes = new Hono<AppEnv>();

adminCampaignRoutes.use("*", superAdminMiddleware);

function buildService(): CampaignService {
  const db = getDb();
  return new CampaignService(buildRepos(db).campaigns as any, db);
}

async function audit(
  actorId: string,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await getDb()
    .insert(adminAuditLog)
    .values({ actorId, action, targetType: "email_campaign", targetId, metadata } as any)
    .catch(() => undefined);
}

// ── Campaigns ────────────────────────────────────────────────────────────────
adminCampaignRoutes.get("/", async (c) => {
  return c.json(success(await buildService().list()), 200);
});

adminCampaignRoutes.post("/", async (c) => {
  const parsed = CreateCampaignSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const actorId = c.var.user?.sub as string;
  const db = getDb();
  // SuperAdmin marketing campaigns are always sent as the hired.video company.
  const senderCompanyId = await getPlatformCompanyId(db);
  const created = await new CampaignService(buildRepos(db).campaigns as any, db).create(
    parsed.data,
    { createdByUserId: actorId, senderCompanyId },
  );
  await audit(actorId, "campaign.create", created.id, { name: created.name });
  return c.json(success(created), 201);
});

adminCampaignRoutes.get("/templates", async (c) => {
  return c.json(success(await buildService().listTemplates()), 200);
});

adminCampaignRoutes.post("/templates", async (c) => {
  const parsed = CreateTemplateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const actorId = c.var.user?.sub as string;
  const created = await buildService().createTemplate(parsed.data);
  await audit(actorId, "campaign_template.create", created.id, { name: created.name });
  return c.json(success(created), 201);
});

adminCampaignRoutes.patch("/templates/:id", async (c) => {
  const parsed = UpdateTemplateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const id = c.req.param("id");
  const updated = await buildService().updateTemplate(id, parsed.data);
  if (!updated) return c.json(error("NOT_FOUND", "Template not found"), 404);
  await audit(c.var.user?.sub as string, "campaign_template.update", id, {});
  return c.json(success(updated), 200);
});

adminCampaignRoutes.delete("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await buildService().deleteTemplate(id);
  if (!ok) return c.json(error("NOT_FOUND", "Template not found"), 404);
  await audit(c.var.user?.sub as string, "campaign_template.delete", id, {});
  return c.json(success({ id, deleted: true }), 200);
});

adminCampaignRoutes.post("/audience/preview", async (c) => {
  const parsed = CampaignAudienceSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid audience"), 400);
  }
  return c.json(success(await buildService().previewAudience(parsed.data)), 200);
});

adminCampaignRoutes.get("/:id", async (c) => {
  const dto = await buildService().get(c.req.param("id"));
  if (!dto) return c.json(error("NOT_FOUND", "Campaign not found"), 404);
  return c.json(success(dto), 200);
});

adminCampaignRoutes.patch("/:id", async (c) => {
  const parsed = UpdateCampaignSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const id = c.req.param("id");
  const updated = await buildService().update(id, parsed.data);
  if (!updated) return c.json(error("NOT_FOUND", "Campaign not found"), 404);
  await audit(c.var.user?.sub as string, "campaign.update", id, {});
  return c.json(success(updated), 200);
});

adminCampaignRoutes.post("/:id/schedule", async (c) => {
  const parsed = ScheduleCampaignSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const id = c.req.param("id");
  const result = await buildService().schedule(id, parsed.data.scheduledAt ?? null);
  if (result.ok && result.campaign) {
    await audit(c.var.user?.sub as string, "campaign.schedule", id, {
      scheduledAt: parsed.data.scheduledAt ?? "now",
    });
    return c.json(success(result.campaign), 200);
  }
  return c.json(error("VALIDATION_ERROR", result.reason ?? "Cannot schedule campaign"), 400);
});

adminCampaignRoutes.post("/:id/pause", async (c) => {
  const id = c.req.param("id");
  const updated = await buildService().setStatus(id, "paused");
  if (!updated) return c.json(error("NOT_FOUND", "Campaign not found"), 404);
  await audit(c.var.user?.sub as string, "campaign.pause", id, {});
  return c.json(success(updated), 200);
});

adminCampaignRoutes.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const updated = await buildService().setStatus(id, "cancelled");
  if (!updated) return c.json(error("NOT_FOUND", "Campaign not found"), 404);
  await audit(c.var.user?.sub as string, "campaign.cancel", id, {});
  return c.json(success(updated), 200);
});

export default adminCampaignRoutes;
