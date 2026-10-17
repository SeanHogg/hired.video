/**
 * /api/companies/:id/locations + /:id/team — CRUD for the multi-office
 * structure and team roster. Business rules live in
 * services/company/handlers.ts; the route resolves `:id` (uuid or slug) and
 * authorizes writes with requireCompanyOwner.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  handleCreateLocation,
  handleCreateTeamMember,
  handleDeleteLocation,
  handleDeleteTeamMember,
  handleListLocations,
  handleListTeamMembers,
  handleUpdateLocation,
  handleUpdateTeamMember,
} from "../../services/company/handlers.js";
import { requireCompanyOwner } from "../../services/company/companyOwnership.js";
import { companyDeps, findCompany } from "../../services/company/companyDirectory.js";
import { toHandlerResult } from "../../handlers/shared.js";
import { sendHandlerResult } from "../helpers/routerHelpers.js";

export const companyChildrenRoutes = new Hono<AppEnv>();

// ─── Company Locations ────────────────────────────────────────────────────

companyChildrenRoutes.get("/:id/locations", async (c) => {
  const company = await findCompany(c.req.param("id"));
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  return c.json(success(await handleListLocations(companyDeps(), company.id)), 200);
});

companyChildrenRoutes.post("/:id/locations", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const body = await c.req.json().catch(() => ({}));
  return sendHandlerResult(c, await toHandlerResult(handleCreateLocation(companyDeps(), access!.companyId, body), 201));
});

companyChildrenRoutes.put("/:id/locations/:locationId", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const body = await c.req.json().catch(() => ({}));
  return sendHandlerResult(
    c,
    await toHandlerResult(handleUpdateLocation(companyDeps(), access!.companyId, c.req.param("locationId"), body)),
  );
});

companyChildrenRoutes.delete("/:id/locations/:locationId", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  await handleDeleteLocation(companyDeps(), access!.companyId, c.req.param("locationId"));
  return c.json(success(null, "Location deleted"), 200);
});

// ─── Company Team Members ─────────────────────────────────────────────────

companyChildrenRoutes.get("/:id/team", async (c) => {
  const company = await findCompany(c.req.param("id"));
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  return c.json(success(await handleListTeamMembers(companyDeps(), company.id)), 200);
});

companyChildrenRoutes.post("/:id/team", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const body = await c.req.json().catch(() => ({}));
  return sendHandlerResult(c, await toHandlerResult(handleCreateTeamMember(companyDeps(), access!.companyId, body), 201));
});

companyChildrenRoutes.put("/:id/team/:memberId", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const body = await c.req.json().catch(() => ({}));
  return sendHandlerResult(
    c,
    await toHandlerResult(handleUpdateTeamMember(companyDeps(), access!.companyId, c.req.param("memberId"), body)),
  );
});

companyChildrenRoutes.delete("/:id/team/:memberId", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  await handleDeleteTeamMember(companyDeps(), access!.companyId, c.req.param("memberId"));
  return c.json(success(null, "Team member deleted"), 200);
});
