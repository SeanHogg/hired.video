/**
 * /api/companies company-profile lifecycle: create (POST /), AI extract
 * (POST /extract), detail (GET /:id — uuid or slug, records the view),
 * update, delete and clone. Mounted AFTER the directory router so its static
 * GETs (/public, /me, /trending, …) win over GET /:id.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { servicesProcessor } from "../../domains/services-processing/index.js";
import { requireCompanyOwner } from "../../services/company/companyOwnership.js";
import { getCompanyDetail } from "../../services/company/companyDirectory.js";
import {
  cloneCompany,
  createCompany,
  deleteCompany,
  findCompanyToClone,
  updateCompany,
} from "../../services/company/companyWrites.js";
import {
  ExtractCompanySchema,
  createExtractedCompany,
  extractCompanyFromHtml,
  mergeIntoExistingCompany,
} from "../../services/company/companyExtract.js";
import { ipCountryFromCtx } from "../../services/analytics/artifactView.js";
import { hashClientIp } from "../../utils/crypto.js";
import { toHandlerResult } from "../../handlers/shared.js";
import { requireUser, sendHandlerResult } from "../helpers/routerHelpers.js";
import { envRecord, settle, viewerId } from "./shared.js";

export const companyProfileRoutes = new Hono<AppEnv>();

companyProfileRoutes.post("/", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await c.req.json().catch(() => ({}));
  if (!body.name) return c.json(error("BAD_REQUEST", "Company name is required"), 400);

  // Closes gap-register #780: enforce Free-tier 50-companies/mo cap.
  // SuperAdmins bypass automatically via isAdminRole.
  const blocked = await servicesProcessor.enforce(c, "company_db_write");
  if (blocked) return blocked;

  const { row, meta } = await createCompany(auth.userId, body, envRecord(c));
  servicesProcessor.meterEvent(c, "company_db_write", { id: row?.id });
  return c.json(success(meta), 201);
});

// Get by ID *or slug* — returns the full CompanyProfile shape consumed by
// CompanyDetail.tsx. Slug-form URLs land here too because the frontend
// route `/companies/:id` passes the path segment straight through.
companyProfileRoutes.get("/:id", async (c) => {
  return sendHandlerResult(
    c,
    await toHandlerResult(
      getCompanyDetail(c.req.param("id"), {
        userId: viewerId(c),
        ipHash: hashClientIp(c),
        ipCountry: ipCountryFromCtx(c),
        referrer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
      }),
    ),
  );
});

// Update company
companyProfileRoutes.put("/:id", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const body = await c.req.json().catch(() => ({}));
  return c.json(success(await updateCompany(access!.companyId, body, envRecord(c))), 200);
});

// Delete company
companyProfileRoutes.delete("/:id", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  await deleteCompany(access!.companyId);
  return c.json(success(null, "Company deleted"), 200);
});

/** POST /api/companies/:id/clone — duplicate a company the caller owns. */
companyProfileRoutes.post("/:id/clone", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const original = await settle(c, findCompanyToClone(access!.companyId));
  if ("response" in original) return original.response;

  // Closes gap-register #780: clones consume the same cap as POST /, else
  // the 50/mo Free cap is trivially bypassed via repeated clone calls.
  const blocked = await servicesProcessor.enforce(c, "company_db_write");
  if (blocked) return blocked;

  const { row, meta } = await cloneCompany(original.data, c.var.user!.sub);
  servicesProcessor.meterEvent(c, "company_db_write", { id: row?.id });
  return c.json(success(meta), 201);
});

// POST /extract — AI-extract company details from page HTML, deduplicating
// against existing company_profiles by slug / name and merging blank fields
// into a match.
companyProfileRoutes.post("/extract", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;

  const body = await c.req.json().catch(() => null);
  const parsed = ExtractCompanySchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const extracted = await settle(c, extractCompanyFromHtml(c.env, c.var.user, parsed.data.html));
  if ("response" in extracted) return extracted.response;

  const { slug, merged } = await mergeIntoExistingCompany(extracted.data);
  if (merged) return c.json(success(merged), 200);

  // Closes gap-register #780: only the new-row branch consumes the cap —
  // the dedup-and-merge branch above is a PATCH equivalent, not a create.
  const blocked = await servicesProcessor.enforce(c, "company_db_write");
  if (blocked) return blocked;

  const created = await createExtractedCompany(auth.userId, extracted.data, slug);
  servicesProcessor.meterEvent(c, "company_db_write", { id: created?.id });
  return c.json(success({ company: created, duplicate: false }), 201);
});
