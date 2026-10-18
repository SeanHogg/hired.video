// whitelabel.ts — White-label / agency tier (#75), university partnerships (#79),
//                 B2B sales motion (#80)
//
// White-labeled career portals: staffing agencies + universities get a branded
// subdomain with custom logo/colours and their own candidate pool + analytics.

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";
import {
  TenantSchema,
  createTenant,
  getOwnedTenant,
  getPortalBranding,
  getTenantAnalytics,
  listTenants,
  recordDemoRequest,
  updateOwnedTenant,
} from "../services/platform/whitelabelTenants.js";

export const whitelabelRoutes = new Hono<AppEnv>();

// ─── Tenant management ────────────────────────────────────────────────────────

/** GET /api/whitelabel/tenants — admin: list all tenants */
whitelabelRoutes.get("/tenants", async (c) => {
  requireUser(c);
  return c.json(success(await listTenants()), 200);
});

/** POST /api/whitelabel/tenants — create a white-label tenant */
whitelabelRoutes.post("/tenants", validateJson(TenantSchema, (e) => error("VALIDATION_ERROR", "Invalid tenant data", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const tenant = await createTenant(userId, c.req.valid("json"));
  return c.json(success(tenant), 201);
});

/** GET /api/whitelabel/tenants/:id — get tenant details */
whitelabelRoutes.get("/tenants/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getOwnedTenant(c.req.param("id"), userId)), 200);
});

/** PATCH /api/whitelabel/tenants/:id — update branding/settings */
whitelabelRoutes.patch("/tenants/:id", validateJson(TenantSchema.partial(), (e) => error("VALIDATION_ERROR", "Invalid update data", e.flatten())), async (c) => {
  const userId = requireUser(c);
  const updated = await updateOwnedTenant(c.req.param("id"), userId, c.req.valid("json"));
  return c.json(success(updated), 200);
});

// ─── Public portal lookup (for white-labeled frontend) ────────────────────────

/** GET /api/whitelabel/portal/:subdomain — public: get portal branding by subdomain */
whitelabelRoutes.get("/portal/:subdomain", async (c) => {
  return c.json(success(await getPortalBranding(c.req.param("subdomain"))), 200);
});

// ─── Placement analytics for university portals (#79) ─────────────────────────

/**
 * GET /api/whitelabel/tenants/:id/analytics
 * Placement analytics for university/bootcamp partner portals.
 * Returns: placement rate, avg time-to-hire, top employers, salary outcomes.
 */
whitelabelRoutes.get("/tenants/:id/analytics", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getTenantAnalytics(c.req.param("id"), userId)), 200);
});

// ─── B2B sales motion (#80) ───────────────────────────────────────────────────

/**
 * POST /api/whitelabel/demo-request
 * Prospect fills out "Request a demo" form. Creates a marketing lead.
 */
whitelabelRoutes.post("/demo-request", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email: string = String(body.email ?? "").trim().toLowerCase();
  const company: string = String(body.company ?? "").trim();
  if (!email.includes("@")) return c.json(error("VALIDATION_ERROR", "Valid email is required"), 400);

  await recordDemoRequest({
    email,
    company,
    name: body.name,
    useCase: body.useCase,
    teamSize: body.teamSize,
    phone: body.phone,
  });

  return c.json(success({
    message: "Demo request received. Our team will reach out within 1 business day.",
    email,
  }), 201);
});

/**
 * GET /api/whitelabel/roi-calculator
 * Returns estimated ROI for an agency/staffing firm switching to the platform.
 * Query: ?recruiters=5 &placementsPerMonth=10 &avgFeeUsd=8000
 */
whitelabelRoutes.get("/roi-calculator", (c) => {
  const recruiters = Math.max(1, Number(c.req.query("recruiters") ?? 5));
  const placementsPerMonth = Math.max(1, Number(c.req.query("placementsPerMonth") ?? 10));
  const avgFeeUsd = Math.max(1000, Number(c.req.query("avgFeeUsd") ?? 8000));

  // Platform estimates: 35% more placements, 40% faster time-to-fill, 20% less admin
  const baseline = { recruiters, placementsPerMonth, revenuePerMonth: placementsPerMonth * avgFeeUsd };
  const withPlatform = {
    placementsPerMonth: Math.round(placementsPerMonth * 1.35),
    revenuePerMonth: Math.round(placementsPerMonth * 1.35 * avgFeeUsd),
    timeSavedHoursPerWeek: Math.round(recruiters * 8 * 0.2), // 20% admin reduction
  };
  const platformCost = recruiters * 49; // $49/seat/month (team tier)
  const netGain = withPlatform.revenuePerMonth - baseline.revenuePerMonth - platformCost;

  return c.json(success({
    baseline,
    withPlatform,
    platformMonthlyCost: platformCost,
    netMonthlyGain: netGain,
    roiPercent: Math.round((netGain / platformCost) * 100),
    paybackDays: netGain > 0 ? Math.round((platformCost / (netGain / 30))) : null,
    assumptions: [
      "35% increase in placements (AI sourcing + Boolean search)",
      "40% reduction in time-to-fill (automated outreach + interview scheduling)",
      "20% less admin overhead (ATS integrations + automated follow-ups)",
    ],
  }), 200);
});
