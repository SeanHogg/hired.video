/**
 * /api/paid-media/* — external ad-platform integration routes.
 *
 * Mounted in app.ts behind the standard auth middleware. OAuth
 * start/callback are handled inline (they're top-level browser
 * navigations, so they ride a short-lived JWT in `state` like
 * /api/integrations/email/* does — see oauth.ts).
 *
 * Naming: paid-media to distinguish from /api/advertising (internal
 * on-platform boosts) and /api/ads (legacy ads config).
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { listAdapters, getAdapter, assertPlatform, type PaidMediaEnv } from "../services/paid-media/ports/registry.js";
import {
  completeOAuth,
  parseWorkspaceParam,
  serializeWorkspace,
  signOAuthState,
  verifyOAuthState,
} from "../services/paid-media/oauth.js";
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listAdSets,
  createAdSet,
  updateAdSet,
  deleteAdSet,
  listAds,
  createAd,
  updateAd,
  deleteAd,
  listCreatives,
  createCreative,
  updateCreative,
  deleteCreative,
} from "../services/paid-media/campaigns.js";
import {
  syncCampaignToAccount,
  syncAdSetToAccount,
  syncCreativeToAccount,
  syncAdToAccount,
  pullInsightsFromAccount,
} from "../services/paid-media/sync.js";
import {
  getPixelSettings,
  getPublicPixels,
  recordWorkspaceConversion,
  savePixelSettings,
} from "../services/paid-media/tracking.js";
import {
  assertAdAccountWritable,
  deleteAdConnection,
  listAdAccounts,
  listAdConnections,
  listInsights,
} from "../services/paid-media/accounts.js";
import { getHouseWorkspaceConfig } from "../services/paid-media/house-workspace.js";
import { readClickIds } from "../middleware/clickIdCapture.js";
import { WorkspaceForbiddenError } from "../services/studio/workspace.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { frontendBaseUrl } from "../utils/public-urls.js";
import { logger } from "../lib/logger.js";

export const paidMediaRoutes = new Hono<AppEnv>();

function env(c: any): PaidMediaEnv & { JWT_SECRET?: string; BASE_URL?: string; HOUSE_USER_ID?: string } {
  return (c.env ?? process.env) as any;
}

function workspaceFromQuery(c: any): ReturnType<typeof parseWorkspaceParam> {
  const w = c.req.query("workspace");
  return parseWorkspaceParam(w ?? "personal");
}

function withinErrorHandling<T>(c: any, fn: () => Promise<T>): Promise<Response> {
  return fn()
    .then((data) => c.json(success(data)))
    .catch((err: unknown) => {
      if (err instanceof WorkspaceForbiddenError) {
        return c.json(error("FORBIDDEN", err.message), 403);
      }
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[paid-media] request failed", err);
      return c.json(error("INTERNAL", msg), 500);
    });
}

// ─── Platform discovery ───────────────────────────────────────────────────
paidMediaRoutes.get("/platforms", (c) => {
  return c.json(success(listAdapters(env(c))));
});

// ─── House workspace config (#986) ──────────────────────────────────────────
// SA-only. Surfaces HOUSE_USER_ID so the /superadmin/ads page can bind the
// house workspace via forceWorkspace={{ kind:'delegated', subjectUserId }}
// instead of falling through to the calling SA's PERSONAL ad connections.
//
// As a side effect it lazily ensures the calling SuperAdmin holds an active
// `workspace_grants` row (scope 'studio') against the house subject, so
// canActFor() authorizes the delegated workspace on every subsequent
// paid-media write. The seed script does the same on first boot; this guards
// the case where a NEW SA visits the page before the seed re-runs. We reuse
// the existing `delegated` kind + canActFor SSoT — no 4th workspace kind.
paidMediaRoutes.get("/house-config", async (c) => withinErrorHandling(c, () =>
  getHouseWorkspaceConfig({
    actorUserId:       c.var.userId,
    actorIsSuperAdmin: isSuperAdmin(c.var.user),
    houseUserId:       env(c).HOUSE_USER_ID ?? null,
  }),
));

// ─── OAuth ────────────────────────────────────────────────────────────────
// POST /oauth/start — auth-required. SPA calls with workspace + platform,
// receives { url } to redirect the browser to. We don't redirect from this
// endpoint because the call carries an Authorization header that wouldn't
// survive a 302 to the consent screen.
const OAuthStartSchema = z.object({
  platform:   z.string(),
  workspace:  z.string().default("personal"),
  redirectTo: z.string().url().optional(),
});

paidMediaRoutes.post("/oauth/start", async (c) => withinErrorHandling(c, async () => {
  const userId = c.var.userId;
  const body = OAuthStartSchema.parse(await c.req.json());
  assertPlatform(body.platform);
  const adapter = getAdapter(env(c), body.platform);
  if (!adapter.isConfigured()) {
    throw new Error(`${body.platform} OAuth credentials not configured in env`);
  }
  const baseUrl = env(c).BASE_URL ?? "https://api.hired.video";
  const redirectUri = `${baseUrl}/api/paid-media/oauth/callback`;
  const state = await signOAuthState(env(c), { userId, platform: body.platform as any, workspace: body.workspace, redirectTo: body.redirectTo });
  return { url: adapter.buildAuthUrl({ redirectUri, state }) };
}));

paidMediaRoutes.get("/oauth/callback", async (c) => {
  const code  = c.req.query("code");
  const state = c.req.query("state");
  const platformErr = c.req.query("error") ?? c.req.query("error_description");
  const frontendUrl = frontendBaseUrl();
  if (platformErr) {
    return c.redirect(`${frontendUrl}/settings/ads?status=error&reason=${encodeURIComponent(platformErr)}`);
  }
  if (!code || !state) {
    return c.redirect(`${frontendUrl}/settings/ads?status=error&reason=missing_code_or_state`);
  }
  try {
    const baseUrl = env(c).BASE_URL ?? "https://api.hired.video";
    const result = await completeOAuth({ env: env(c) }, {
      state,
      code,
      redirectUri: `${baseUrl}/api/paid-media/oauth/callback`,
    });
    const claims = await verifyOAuthState(env(c), state);
    const target = claims.redirectTo ?? `${frontendUrl}/settings/ads?status=connected&platform=${result.platform}&accounts=${result.accountCount}`;
    return c.redirect(target);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.redirect(`${frontendUrl}/settings/ads?status=error&reason=${encodeURIComponent(msg)}`);
  }
});

// ─── Connections / Accounts ───────────────────────────────────────────────
paidMediaRoutes.get("/connections", async (c) => withinErrorHandling(c, () =>
  listAdConnections(c.var.userId),
));

paidMediaRoutes.delete("/connections/:id", async (c) => withinErrorHandling(c, () =>
  deleteAdConnection(c.var.userId, c.req.param("id")),
));

paidMediaRoutes.get("/accounts", async (c) => withinErrorHandling(c, () =>
  listAdAccounts(c.var.userId),
));

// ─── Campaigns ────────────────────────────────────────────────────────────
const CampaignCreateSchema = z.object({
  name:              z.string().min(1).max(255),
  objective:         z.string().optional(),
  status:            z.string().optional(),
  budgetCents:       z.number().int().nullable().optional(),
  dailyBudgetCents:  z.number().int().nullable().optional(),
  currencyCode:      z.string().length(3).optional(),
  startAt:           z.string().datetime().nullable().optional(),
  endAt:             z.string().datetime().nullable().optional(),
  subjectType:       z.string().nullable().optional(),
  subjectId:         UuidLikeSchema.nullable().optional(),
  notes:             z.string().nullable().optional(),
  metadata:          z.record(z.string(), z.unknown()).optional(),
});

paidMediaRoutes.get("/campaigns", async (c) => withinErrorHandling(c, () =>
  listCampaigns(c.var.userId, workspaceFromQuery(c)),
));

paidMediaRoutes.post("/campaigns", async (c) => withinErrorHandling(c, async () => {
  const body = CampaignCreateSchema.parse(await c.req.json());
  return createCampaign(c.var.userId, workspaceFromQuery(c), {
    ...body,
    startAt: body.startAt ? new Date(body.startAt) : null,
    endAt:   body.endAt   ? new Date(body.endAt)   : null,
  } as any);
}));

paidMediaRoutes.get("/campaigns/:id", async (c) => withinErrorHandling(c, () =>
  getCampaign(c.var.userId, c.req.param("id")),
));

paidMediaRoutes.patch("/campaigns/:id", async (c) => withinErrorHandling(c, async () => {
  const body = CampaignCreateSchema.partial().parse(await c.req.json());
  return updateCampaign(c.var.userId, c.req.param("id"), {
    ...body,
    startAt: body.startAt ? new Date(body.startAt) : undefined,
    endAt:   body.endAt   ? new Date(body.endAt)   : undefined,
  } as any);
}));

paidMediaRoutes.delete("/campaigns/:id", async (c) => withinErrorHandling(c, async () => {
  await deleteCampaign(c.var.userId, c.req.param("id"));
  return { deleted: true };
}));

// ─── Ad Sets ──────────────────────────────────────────────────────────────
const AdSetCreateSchema = z.object({
  name:                    z.string().min(1).max(255),
  status:                  z.string().optional(),
  bidStrategy:             z.string().optional(),
  bidAmountCents:          z.number().int().nullable().optional(),
  optimizationGoal:        z.string().optional(),
  dailyBudgetCents:        z.number().int().nullable().optional(),
  lifetimeBudgetCents:     z.number().int().nullable().optional(),
  targeting:               z.record(z.string(), z.unknown()).optional(),
  frequencyCapImpressions: z.number().int().nullable().optional(),
  frequencyCapHours:       z.number().int().nullable().optional(),
  startAt:                 z.string().datetime().nullable().optional(),
  endAt:                   z.string().datetime().nullable().optional(),
});

paidMediaRoutes.get("/campaigns/:id/ad-sets", async (c) => withinErrorHandling(c, () =>
  listAdSets(c.var.userId, c.req.param("id")),
));

paidMediaRoutes.post("/campaigns/:id/ad-sets", async (c) => withinErrorHandling(c, async () => {
  const body = AdSetCreateSchema.parse(await c.req.json());
  return createAdSet(c.var.userId, c.req.param("id"), {
    ...body,
    startAt: body.startAt ? new Date(body.startAt) : null,
    endAt:   body.endAt   ? new Date(body.endAt)   : null,
  } as any);
}));

paidMediaRoutes.patch("/ad-sets/:id", async (c) => withinErrorHandling(c, async () => {
  const body = AdSetCreateSchema.partial().parse(await c.req.json());
  return updateAdSet(c.var.userId, c.req.param("id"), {
    ...body,
    startAt: body.startAt ? new Date(body.startAt) : undefined,
    endAt:   body.endAt   ? new Date(body.endAt)   : undefined,
  } as any);
}));

paidMediaRoutes.delete("/ad-sets/:id", async (c) => withinErrorHandling(c, async () => {
  await deleteAdSet(c.var.userId, c.req.param("id"));
  return { deleted: true };
}));

// ─── Ads ──────────────────────────────────────────────────────────────────
const AdCreateSchema = z.object({
  name:           z.string().min(1).max(255),
  status:         z.string().optional(),
  creativeId:     UuidLikeSchema.nullable().optional(),
  destinationUrl: z.string().url(),
  utmSource:      z.string().nullable().optional(),
  utmMedium:      z.string().nullable().optional(),
  utmCampaign:    z.string().nullable().optional(),
  utmContent:     z.string().nullable().optional(),
  utmTerm:        z.string().nullable().optional(),
  variantGroup:   z.string().max(16).nullable().optional(),
});

paidMediaRoutes.get("/ad-sets/:id/ads", async (c) => withinErrorHandling(c, () =>
  listAds(c.var.userId, c.req.param("id")),
));

paidMediaRoutes.post("/ad-sets/:id/ads", async (c) => withinErrorHandling(c, async () => {
  const body = AdCreateSchema.parse(await c.req.json());
  return createAd(c.var.userId, c.req.param("id"), body as any);
}));

paidMediaRoutes.patch("/ads/:id", async (c) => withinErrorHandling(c, async () => {
  const body = AdCreateSchema.partial().parse(await c.req.json());
  return updateAd(c.var.userId, c.req.param("id"), body as any);
}));

paidMediaRoutes.delete("/ads/:id", async (c) => withinErrorHandling(c, async () => {
  await deleteAd(c.var.userId, c.req.param("id"));
  return { deleted: true };
}));

// ─── Creatives ────────────────────────────────────────────────────────────
const CreativeCreateSchema = z.object({
  name:              z.string().min(1).max(255),
  format:            z.string().optional(),
  headline:          z.string().nullable().optional(),
  primaryText:       z.string().nullable().optional(),
  description:       z.string().nullable().optional(),
  ctaText:           z.string().optional(),
  assetUrl:          z.string().url().nullable().optional(),
  assetThumbnailUrl: z.string().url().nullable().optional(),
  studioProjectId:   UuidLikeSchema.nullable().optional(),
  assets:            z.array(z.record(z.string(), z.unknown())).optional(),
  metadata:          z.record(z.string(), z.unknown()).optional(),
});

paidMediaRoutes.get("/creatives", async (c) => withinErrorHandling(c, () =>
  listCreatives(c.var.userId, workspaceFromQuery(c)),
));

paidMediaRoutes.post("/creatives", async (c) => withinErrorHandling(c, async () => {
  const body = CreativeCreateSchema.parse(await c.req.json());
  return createCreative(c.var.userId, workspaceFromQuery(c), body as any);
}));

paidMediaRoutes.patch("/creatives/:id", async (c) => withinErrorHandling(c, async () => {
  const body = CreativeCreateSchema.partial().parse(await c.req.json());
  return updateCreative(c.var.userId, c.req.param("id"), body as any);
}));

paidMediaRoutes.delete("/creatives/:id", async (c) => withinErrorHandling(c, async () => {
  await deleteCreative(c.var.userId, c.req.param("id"));
  return { deleted: true };
}));

// ─── Sync ─────────────────────────────────────────────────────────────────
const SyncCampaignSchema = z.object({ accountId: UuidLikeSchema });

paidMediaRoutes.post("/campaigns/:id/sync", async (c) => withinErrorHandling(c, async () => {
  const { accountId } = SyncCampaignSchema.parse(await c.req.json());
  // Ensure actor owns the campaign — loads + asserts.
  await getCampaign(c.var.userId, c.req.param("id"));
  await assertAdAccountWritable(c.var.userId, accountId);
  return syncCampaignToAccount({ env: env(c) }, c.req.param("id"), accountId);
}));

paidMediaRoutes.post("/ad-sets/:id/sync", async (c) => withinErrorHandling(c, async () => {
  const { accountId } = SyncCampaignSchema.parse(await c.req.json());
  await assertAdAccountWritable(c.var.userId, accountId);
  return syncAdSetToAccount({ env: env(c) }, c.req.param("id"), accountId);
}));

paidMediaRoutes.post("/creatives/:id/sync", async (c) => withinErrorHandling(c, async () => {
  const { accountId } = SyncCampaignSchema.parse(await c.req.json());
  await assertAdAccountWritable(c.var.userId, accountId);
  return syncCreativeToAccount({ env: env(c) }, c.req.param("id"), accountId);
}));

paidMediaRoutes.post("/ads/:id/sync", async (c) => withinErrorHandling(c, async () => {
  const { accountId } = SyncCampaignSchema.parse(await c.req.json());
  await assertAdAccountWritable(c.var.userId, accountId);
  return syncAdToAccount({ env: env(c) }, c.req.param("id"), accountId);
}));

// ─── Reporting ────────────────────────────────────────────────────────────
const PullInsightsSchema = z.object({
  accountId:    UuidLikeSchema,
  resourceKind: z.enum(["campaign", "ad_set", "ad"]),
  externalIds:  z.array(z.string()).optional(),
  since:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

paidMediaRoutes.post("/insights/pull", async (c) => withinErrorHandling(c, async () => {
  const body = PullInsightsSchema.parse(await c.req.json());
  await assertAdAccountWritable(c.var.userId, body.accountId);
  return pullInsightsFromAccount({ env: env(c) }, body);
}));

paidMediaRoutes.get("/insights", async (c) => withinErrorHandling(c, () =>
  listInsights(c.var.userId, {
    since:      c.req.query("since") || undefined,
    until:      c.req.query("until") || undefined,
    internalId: c.req.query("internalId") || undefined,
  }),
));

// ─── Pixels ───────────────────────────────────────────────────────────────
const PixelUpdateSchema = z.object({
  metaPixelId:                z.string().nullable().optional(),
  googleAdsConversionId:      z.string().nullable().optional(),
  googleAdsConversionLabel:   z.string().nullable().optional(),
  ga4MeasurementId:           z.string().nullable().optional(),
  linkedInPartnerId:          z.string().nullable().optional(),
  tiktokPixelId:              z.string().nullable().optional(),
  bingUetTagId:               z.string().nullable().optional(),
  // Secret tokens come in plaintext on write; we encrypt before persist.
  metaCapiToken:              z.string().nullable().optional(),
  tiktokAccessToken:          z.string().nullable().optional(),
  linkedInCapiToken:          z.string().nullable().optional(),
  bingUetApiToken:            z.string().nullable().optional(),
  ga4ApiSecret:               z.string().nullable().optional(),
});

paidMediaRoutes.get("/pixels", async (c) => withinErrorHandling(c, async () =>
  getPixelSettings(c.var.userId, workspaceFromQuery(c)),
));

paidMediaRoutes.put("/pixels", async (c) => withinErrorHandling(c, async () => {
  const ws = workspaceFromQuery(c);
  const body = PixelUpdateSchema.parse(await c.req.json());
  return savePixelSettings(env(c), c.var.userId, ws, body);
}));

/** Public pixel config — the frontend reads this from app shell to
 *  inject pixel snippets at runtime. The route is public when no
 *  workspace param is given (returns the house workspace's config). */
paidMediaRoutes.get("/pixels/public", async (c) => withinErrorHandling(c, async () =>
  getPublicPixels({
    houseUserId:        env(c).HOUSE_USER_ID ?? null,
    workspaceUserId:    c.req.query("workspaceUserId") ?? null,
    workspaceCompanyId: c.req.query("workspaceCompanyId") ?? null,
  }),
));

// ─── Conversions ──────────────────────────────────────────────────────────
const ConversionSchema = z.object({
  workspaceUserId:    z.string(),
  workspaceCompanyId: UuidLikeSchema.nullable().optional(),
  eventName:          z.string().min(1).max(64),
  eventTime:          z.string().datetime().optional(),
  valueCents:         z.number().int().nullable().optional(),
  currencyCode:       z.string().length(3).optional(),
  userData: z.object({
    email:      z.string().email().nullable().optional(),
    phone:      z.string().nullable().optional(),
    externalId: z.string().nullable().optional(),
  }).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  sourceUrl:  z.string().url().nullable().optional(),
});

paidMediaRoutes.post("/conversions", async (c) => withinErrorHandling(c, async () => {
  const body = ConversionSchema.parse(await c.req.json());
  const clickIds = readClickIds(c);
  const ipAddress = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;
  return recordWorkspaceConversion(env(c), {
    workspaceUserId:    body.workspaceUserId,
    workspaceCompanyId: body.workspaceCompanyId ?? null,
    userId:             c.var.userId,
    eventName:          body.eventName,
    eventTime:          body.eventTime ? new Date(body.eventTime) : new Date(),
    valueCents:         body.valueCents,
    currencyCode:       body.currencyCode,
    clickIds,
    userData:           body.userData,
    ipAddress,
    userAgent,
    sourceUrl:          body.sourceUrl ?? null,
    properties:         body.properties,
  });
}));
