/**
 * /api/recruiter-bd — agency-recruiter BD pipeline (#99 + #222 + #223).
 *
 *   Clients
 *     GET    /clients
 *     POST   /clients
 *     POST   /clients/:id/contacts
 *
 *   Pipeline stages (configurable per recruiter)
 *     GET    /stages
 *     PUT    /stages
 *
 *   Deals
 *     GET    /deals
 *     POST   /deals
 *     PATCH  /deals/:id/stage   (move stage)
 *     PATCH  /deals/:id/owner   (assign owner)
 *
 *   Rollup
 *     GET    /rollup            (per-stage count + total + weighted)
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { recruiterBdPipelineService } from "../services/recruiter/bd-pipeline.js";

export const recruiterBdRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function requireAuth(c: any): string | Response {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return userId;
}

const NewClientSchema = z.object({
  clientName: z.string().min(1).max(255),
  companyId: z.string().uuid().optional(),
  website: z.string().max(255).optional(),
  industry: z.string().max(120).optional(),
  notes: z.string().max(10_000).optional(),
});

recruiterBdRoutes.get("/clients", async (c) => {
  const u = requireAuth(c); if (typeof u !== "string") return u;
  return c.json(success({ items: await recruiterBdPipelineService.listClients(u) }), 200);
});

recruiterBdRoutes.post("/clients", async (c) => {
  const u = requireAuth(c); if (typeof u !== "string") return u;
  const parsed = NewClientSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid client", parsed.error.flatten()), 400);
  return c.json(success({ client: await recruiterBdPipelineService.createClient(u, parsed.data) }), 201);
});

const ClientContactSchema = z.object({
  name: z.string().min(1).max(255),
  title: z.string().max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(64).optional(),
  isPrimary: z.boolean().optional(),
});

recruiterBdRoutes.post("/clients/:id/contacts", async (c) => {
  const u = requireAuth(c); if (typeof u !== "string") return u;
  const parsed = ClientContactSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid contact", parsed.error.flatten()), 400);
  const row = await recruiterBdPipelineService.addClientContact({
    clientId: c.req.param("id"),
    recruiterUserId: u,
    name: parsed.data.name,
    title: parsed.data.title ?? null,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    isPrimary: parsed.data.isPrimary ?? false,
  });
  if (!row) return c.json(error("NOT_FOUND", "Client not found"), 404);
  return c.json(success({ contact: row }), 201);
});

recruiterBdRoutes.get("/stages", async (c) => {
  const u = requireAuth(c); if (typeof u !== "string") return u;
  const pipelineKey = c.req.query("pipelineKey") ?? "default";
  return c.json(success({ items: await recruiterBdPipelineService.listStages(u, pipelineKey) }), 200);
});

const StageUpsertSchema = z.object({
  pipelineKey: z.string().max(32).optional(),
  stageKey: z.string().min(1).max(48),
  stageLabel: z.string().min(1).max(128),
  ordinal: z.number().int().min(0).max(99),
  defaultValueCents: z.number().int().min(0).optional(),
  winProbabilityBps: z.number().int().min(0).max(10_000).optional(),
  isClosedWon: z.boolean().optional(),
  isClosedLost: z.boolean().optional(),
});

recruiterBdRoutes.put("/stages", async (c) => {
  const u = requireAuth(c); if (typeof u !== "string") return u;
  const parsed = StageUpsertSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid stage", parsed.error.flatten()), 400);
  const row = await recruiterBdPipelineService.upsertStage({
    recruiterUserId: u,
    ...parsed.data,
  });
  return c.json(success({ stage: row }), 200);
});

const NewDealSchema = z.object({
  clientId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  pipelineKey: z.string().max(32).optional(),
  stageKey: z.string().max(48).optional(),
  ownerUserId: z.string().uuid().optional(),
  ownerType: z.string().max(24).optional(),
  estFeeCents: z.number().int().min(0).optional(),
  winProbabilityBps: z.number().int().min(0).max(10_000).optional(),
  expectedCloseDate: z.string().optional(),
  notes: z.string().max(10_000).optional(),
});

recruiterBdRoutes.get("/deals", async (c) => {
  const u = requireAuth(c); if (typeof u !== "string") return u;
  return c.json(success({ items: await recruiterBdPipelineService.listDeals(u) }), 200);
});

recruiterBdRoutes.post("/deals", async (c) => {
  const u = requireAuth(c); if (typeof u !== "string") return u;
  const parsed = NewDealSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid deal", parsed.error.flatten()), 400);
  return c.json(success({ deal: await recruiterBdPipelineService.createDeal(u, parsed.data) }), 201);
});

const StageMoveSchema = z.object({
  stageKey: z.string().min(1).max(48),
  pipelineKey: z.string().max(32).optional(),
});

recruiterBdRoutes.patch("/deals/:id/stage", async (c) => {
  const u = requireAuth(c); if (typeof u !== "string") return u;
  const parsed = StageMoveSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid stage move", parsed.error.flatten()), 400);
  const row = await recruiterBdPipelineService.moveDealToStage({
    dealId: c.req.param("id"),
    recruiterUserId: u,
    stageKey: parsed.data.stageKey,
    pipelineKey: parsed.data.pipelineKey,
  });
  if (!row) return c.json(error("NOT_FOUND", "Deal not found"), 404);
  return c.json(success({ deal: row }), 200);
});

const OwnerSchema = z.object({
  ownerUserId: z.string().uuid().nullable(),
  ownerType: z.string().max(24).optional(),
});

recruiterBdRoutes.patch("/deals/:id/owner", async (c) => {
  const u = requireAuth(c); if (typeof u !== "string") return u;
  const parsed = OwnerSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid owner", parsed.error.flatten()), 400);
  const row = await recruiterBdPipelineService.assignDealOwner({
    dealId: c.req.param("id"),
    recruiterUserId: u,
    ownerUserId: parsed.data.ownerUserId,
    ownerType: parsed.data.ownerType,
  });
  if (!row) return c.json(error("NOT_FOUND", "Deal not found"), 404);
  return c.json(success({ deal: row }), 200);
});

recruiterBdRoutes.get("/rollup", async (c) => {
  const u = requireAuth(c); if (typeof u !== "string") return u;
  const pipelineKey = c.req.query("pipelineKey") ?? "default";
  return c.json(success(await recruiterBdPipelineService.pipelineRollup(u, pipelineKey)), 200);
});

recruiterBdRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Recruiter-BD route not found" } }, 404),
);
