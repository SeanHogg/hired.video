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
import { resolveCompanyScope } from "../services/company/scope.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const recruiterBdRoutes = new Hono<AppEnv>();

/** Resolve the caller's shared BD workspaces (#1766): every company/agency they
 *  own or are an active member of. Reads fall through these OR the owner id, and
 *  creates stamp the primary workspace so teammates see the new row. */
async function bdScope(userId: string): Promise<{ workspaceIds: string[]; primary: string | null }> {
  const scope = await resolveCompanyScope(userId);
  return { workspaceIds: scope.companyIds, primary: scope.primaryCompanyId };
}

const NewClientSchema = z.object({
  clientName: z.string().min(1).max(255),
  companyId: z.string().uuid().optional(),
  website: z.string().max(255).optional(),
  industry: z.string().max(120).optional(),
  notes: z.string().max(10_000).optional(),
});

recruiterBdRoutes.get("/clients", async (c) => {
  const userId = requireUser(c);   const u = userId;
  const { workspaceIds } = await bdScope(u);
  return c.json(success({ items: await recruiterBdPipelineService.listClients(u, workspaceIds) }), 200);
});

recruiterBdRoutes.post("/clients", validateJson(NewClientSchema, (e) => error("VALIDATION_ERROR", "Invalid client", e.flatten())), async (c) => {
  const userId = requireUser(c);   const u = userId;
  const body = c.req.valid("json");
  const { primary } = await bdScope(u);
  return c.json(success({ client: await recruiterBdPipelineService.createClient(u, body, primary) }), 201);
});

const ClientContactSchema = z.object({
  name: z.string().min(1).max(255),
  title: z.string().max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(64).optional(),
  isPrimary: z.boolean().optional(),
});

recruiterBdRoutes.post("/clients/:id/contacts", validateJson(ClientContactSchema, (e) => error("VALIDATION_ERROR", "Invalid contact", e.flatten())), async (c) => {
  const userId = requireUser(c);   const u = userId;
  const body = c.req.valid("json");
  const { workspaceIds } = await bdScope(u);
  const row = await recruiterBdPipelineService.addClientContact({
    clientId: c.req.param("id"),
    recruiterUserId: u,
    workspaceIds,
    name: body.name,
    title: body.title ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    isPrimary: body.isPrimary ?? false,
  });
  if (!row) return c.json(error("NOT_FOUND", "Client not found"), 404);
  return c.json(success({ contact: row }), 201);
});

recruiterBdRoutes.get("/stages", async (c) => {
  const userId = requireUser(c);   const u = userId;
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

recruiterBdRoutes.put("/stages", validateJson(StageUpsertSchema, (e) => error("VALIDATION_ERROR", "Invalid stage", e.flatten())), async (c) => {
  const userId = requireUser(c);   const u = userId;
  const body = c.req.valid("json");
  const row = await recruiterBdPipelineService.upsertStage({
    recruiterUserId: u,
    ...body,
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
  const userId = requireUser(c);   const u = userId;
  const { workspaceIds } = await bdScope(u);
  return c.json(success({ items: await recruiterBdPipelineService.listDeals(u, workspaceIds) }), 200);
});

recruiterBdRoutes.post("/deals", validateJson(NewDealSchema, (e) => error("VALIDATION_ERROR", "Invalid deal", e.flatten())), async (c) => {
  const userId = requireUser(c);   const u = userId;
  const body = c.req.valid("json");
  const { primary } = await bdScope(u);
  return c.json(success({ deal: await recruiterBdPipelineService.createDeal(u, body, primary) }), 201);
});

const StageMoveSchema = z.object({
  stageKey: z.string().min(1).max(48),
  pipelineKey: z.string().max(32).optional(),
});

recruiterBdRoutes.patch("/deals/:id/stage", validateJson(StageMoveSchema, (e) => error("VALIDATION_ERROR", "Invalid stage move", e.flatten())), async (c) => {
  const userId = requireUser(c);   const u = userId;
  const body = c.req.valid("json");
  const { workspaceIds } = await bdScope(u);
  const row = await recruiterBdPipelineService.moveDealToStage({
    dealId: c.req.param("id"),
    recruiterUserId: u,
    workspaceIds,
    stageKey: body.stageKey,
    pipelineKey: body.pipelineKey,
  });
  if (!row) return c.json(error("NOT_FOUND", "Deal not found"), 404);
  return c.json(success({ deal: row }), 200);
});

const OwnerSchema = z.object({
  ownerUserId: z.string().uuid().nullable(),
  ownerType: z.string().max(24).optional(),
});

recruiterBdRoutes.patch("/deals/:id/owner", validateJson(OwnerSchema, (e) => error("VALIDATION_ERROR", "Invalid owner", e.flatten())), async (c) => {
  const userId = requireUser(c);   const u = userId;
  const body = c.req.valid("json");
  const { workspaceIds } = await bdScope(u);
  const row = await recruiterBdPipelineService.assignDealOwner({
    dealId: c.req.param("id"),
    recruiterUserId: u,
    workspaceIds,
    ownerUserId: body.ownerUserId,
    ownerType: body.ownerType,
  });
  if (!row) return c.json(error("NOT_FOUND", "Deal not found"), 404);
  return c.json(success({ deal: row }), 200);
});

recruiterBdRoutes.get("/rollup", async (c) => {
  const userId = requireUser(c);   const u = userId;
  const pipelineKey = c.req.query("pipelineKey") ?? "default";
  const { workspaceIds } = await bdScope(u);
  return c.json(success(await recruiterBdPipelineService.pipelineRollup(u, pipelineKey, workspaceIds)), 200);
});
