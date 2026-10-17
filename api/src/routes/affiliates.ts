// affiliates.ts — composition root for the affiliate / ambassador programme
// (#74), mounted at /api/affiliates and the legacy /api/affiliate alias.
// Multi-tier: Bronze → Silver → Gold → Platinum by conversion count.
//
// Sub-routers (routes/affiliates/):
//   • program.ts — /profile, /click (public), /dashboard, /stats,
//                  /leaderboard (public), /referrals, /conversions, /payout
//   • admin.ts   — /admin/* (adminMiddleware): affiliate status changes,
//                  per-affiliate referrals/conversions, payout lifecycle
//
// Use cases: services/affiliates/ (affiliateProgramService, affiliateAdminService,
// affiliateTiers). Data access: repositories/affiliatesRepository.ts.

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { affiliateProgramRoutes } from "./affiliates/program.js";
import { affiliateAdminRoutes } from "./affiliates/admin.js";

export const affiliateRoutes = new Hono<AppEnv>();

affiliateRoutes.route("/", affiliateProgramRoutes);
affiliateRoutes.route("/", affiliateAdminRoutes);

affiliateRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Affiliate route not found" } }, 404),
);
