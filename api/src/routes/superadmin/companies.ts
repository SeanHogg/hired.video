/**
 * SuperAdmin company management — /api/admin/sa/companies/*.
 * The SA guard is applied once by the admin composite (routes/admin/index.ts).
 *
 * Roster of ALL companies, create, suspend/restore (spam control via
 * is_active), verify, toggle embedding, drill into employees/resumes/jobs,
 * and walk the per-company feature tree.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { parsePagination } from "../../utils/pagination.js";
import {
  listCompanies,
  getCompanyFeatureTree,
  getCompanyEmployees,
  getCompanyJobs,
  getCompanyResumes,
  adminCreateCompany,
  adminUpdateCompanyStatus,
  type CompanyStatus,
} from "../../services/superadmin/companyAdmin.js";

export const superadminCompanyRoutes = new Hono<AppEnv>();

superadminCompanyRoutes.get("/", async (c) => {
  const status = (c.req.query("status") as CompanyStatus) || "all";
  const { page, limit } = parsePagination(c, { defaultLimit: 25, maxLimit: 100 });
  const result = await listCompanies({
    search: c.req.query("search") || undefined,
    status,
    page,
    limit,
  });
  return c.json(success(result));
});

const CreateSchema = z.object({
  name: z.string().min(1).max(255),
  ownerId: z.string().uuid().optional(),
  slug: z.string().max(90).optional(),
  description: z.string().max(2000).optional(),
  isVerified: z.boolean().optional(),
});

superadminCompanyRoutes.post("/", async (c) => {
  const parsed = CreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }
  // Default the owner to the acting SuperAdmin if none supplied.
  const ownerId = parsed.data.ownerId ?? c.var.user!.sub;
  const row = await adminCreateCompany({ ...parsed.data, ownerId });
  return c.json(success(row), 201);
});

superadminCompanyRoutes.get("/:id", async (c) => {
  const tree = await getCompanyFeatureTree(c.req.param("id"));
  if (!tree) return c.json(error("NOT_FOUND", "Company not found"), 404);
  return c.json(success(tree));
});

superadminCompanyRoutes.get("/:id/employees", async (c) => {
  return c.json(success(await getCompanyEmployees(c.req.param("id"))));
});

superadminCompanyRoutes.get("/:id/jobs", async (c) => {
  return c.json(success(await getCompanyJobs(c.req.param("id"))));
});

superadminCompanyRoutes.get("/:id/resumes", async (c) => {
  return c.json(success(await getCompanyResumes(c.req.param("id"))));
});

const StatusSchema = z.object({
  isActive: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  embedEnabled: z.boolean().optional(),
  featured: z.boolean().optional(),
});

superadminCompanyRoutes.patch("/:id", async (c) => {
  const parsed = StatusSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);
  }
  const row = await adminUpdateCompanyStatus(c.req.param("id"), parsed.data);
  if (!row) return c.json(error("NOT_FOUND", "Company not found"), 404);
  return c.json(success(row));
});

export default superadminCompanyRoutes;
