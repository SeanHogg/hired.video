/**
 * The /api/admin composite — the ONE place every admin / SuperAdmin
 * sub-router is mounted and guarded.
 *
 * Each entry is mounted lazily (lib/lazy-route.ts, gap #2339) under
 * `/api/admin<path>` and its guard is applied ONCE here, at the mount —
 * sub-routers never repeat it:
 *   - `superAdminMiddleware` (SA only, impersonation tokens rejected)
 *   - `adminMiddleware`      (Admin or SuperAdmin)
 *
 * Global auth (app.ts `resolveAccessMode`) has already populated c.var.user.
 * Admin prefixes owned by other routers (/job-sources, /tax-reporting,
 * /community-resources, /theme-calendar, /social/oauth) are mounted by app.ts
 * before this composite and are untouched by it. There is no /api/admin
 * catch-all: unmatched paths fall through to the global 404.
 */
import type { Env, Hono, MiddlewareHandler } from "hono";
import type { AppEnv } from "../../types/index.js";
import { lazyRoute, type RouteLoader } from "../../lib/lazy-route.js";
import { adminMiddleware, superAdminMiddleware } from "../../middleware/superAdmin.js";

export const ADMIN_BASE = "/api/admin";

interface AdminMount {
  /** Sub-path under /api/admin, e.g. "/payouts". */
  path: string;
  guard: MiddlewareHandler<AppEnv>;
  load: RouteLoader;
}

const SA = superAdminMiddleware;
const ADMIN = adminMiddleware;

export const ADMIN_MOUNTS: readonly AdminMount[] = [
  // ── SuperAdmin console + impersonation ────────────────────────────────────
  { path: "/sa", guard: SA, load: () => import("../superadmin/index.js").then((m) => m.superadminRoutes) },
  { path: "/impersonate", guard: SA, load: () => import("../superadmin/sessions.js").then((m) => m.sessionRoutes) },
  // ── Product dashboard + platform ops (split from the old admin.ts) ────────
  { path: "/metrics", guard: SA, load: () => import("./metrics.js").then((m) => m.adminMetricsRoutes) },
  { path: "/billing", guard: SA, load: () => import("./billing-ops.js").then((m) => m.adminBillingOpsRoutes) },
  { path: "/settings", guard: SA, load: () => import("./settings.js").then((m) => m.adminSettingsRoutes) },
  { path: "/pricing", guard: SA, load: () => import("./settings.js").then((m) => m.adminPricingRoutes) },
  { path: "/studio", guard: SA, load: () => import("./studio-moderation.js").then((m) => m.adminStudioModerationRoutes) },
  { path: "/content-audiences", guard: SA, load: () => import("./content-audiences.js").then((m) => m.adminContentAudienceRoutes) },
  { path: "/usage", guard: SA, load: () => import("../admin-usage.js").then((m) => m.adminUsageRoutes) },
  // ── SuperAdmin tooling ────────────────────────────────────────────────────
  { path: "/security", guard: SA, load: () => import("../adminSecurity.js").then((m) => m.adminSecurityRoutes) },
  { path: "/partners", guard: SA, load: () => import("../admin-partners.js").then((m) => m.adminPartnerRoutes) },
  { path: "/r2", guard: SA, load: () => import("../admin-r2.js").then((m) => m.adminR2Routes) },
  { path: "/workers", guard: SA, load: () => import("../admin-workers.js").then((m) => m.adminWorkerRoutes) },
  { path: "/courses", guard: SA, load: () => import("../admin-courses.js").then((m) => m.adminCourseRoutes) },
  { path: "/articles", guard: SA, load: () => import("../admin-articles.js").then((m) => m.adminArticleRoutes) },
  { path: "/feed-features", guard: SA, load: () => import("../admin-feed-features.js").then((m) => m.adminFeedFeatureRoutes) },
  { path: "/role-access", guard: SA, load: () => import("../admin-role-access.js").then((m) => m.adminRoleAccessRoutes) },
  { path: "/campaigns", guard: SA, load: () => import("../admin-campaigns.js").then((m) => m.adminCampaignRoutes) },
  { path: "/promotions", guard: SA, load: () => import("../admin-promotions.js").then((m) => m.adminPromotionRoutes) },
  { path: "/content-scans", guard: SA, load: () => import("../admin-content-scans.js").then((m) => m.adminContentScanRoutes) },
  { path: "/coupons", guard: SA, load: () => import("../admin-coupons.js").then((m) => m.adminCouponRoutes) },
  // ── Internal staff (Admin or SuperAdmin) ──────────────────────────────────
  { path: "/payouts", guard: ADMIN, load: () => import("../admin-payouts.js").then((m) => m.adminPayoutRoutes) },
  { path: "/templates-review", guard: ADMIN, load: () => import("../admin-templates-review.js").then((m) => m.adminTemplatesReviewRoutes) },
];

/** Mounts every admin sub-router with its guard. Call once from app.ts,
 *  after the admin prefixes owned by other routers. */
export function registerAdminRoutes<E extends Env>(app: Hono<E>): void {
  for (const { path, guard, load } of ADMIN_MOUNTS) {
    const prefix = `${ADMIN_BASE}${path}`;
    app.use(prefix, guard);
    app.use(`${prefix}/*`, guard);
    lazyRoute(app, prefix, load);
  }
}
