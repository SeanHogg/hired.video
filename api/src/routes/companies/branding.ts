/** /api/companies/:id/branding — employer branding page (public read,
 *  owner upsert). */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success } from "../../types/index.js";
import { requireCompanyOwner } from "../../services/company/companyOwnership.js";
import { getPublishedBrandingPage, upsertBrandingPage } from "../../services/company/companyBranding.js";
import { toHandlerResult } from "../../handlers/shared.js";
import { sendHandlerResult } from "../helpers/routerHelpers.js";
import { settle } from "./shared.js";

export const companyBrandingRoutes = new Hono<AppEnv>();

/** GET /api/companies/:id/branding — public (no auth) */
companyBrandingRoutes.get("/:id/branding", async (c) => {
  return sendHandlerResult(c, await toHandlerResult(getPublishedBrandingPage(c.req.param("id"))));
});

/** PATCH /api/companies/:id/branding — owner only; upserts the branding page */
companyBrandingRoutes.patch("/:id/branding", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const body = await c.req.json().catch(() => ({}));
  const result = await settle(c, upsertBrandingPage(access!.companyId, body));
  if ("response" in result) return result.response;
  return c.json(success(result.data.page), result.data.created ? 201 : 200);
});
