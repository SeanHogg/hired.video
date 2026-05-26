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
import { getDb, schema } from "../db/index.js";
import { and, eq, gte, lte, desc, sql, inArray, isNull, or } from "drizzle-orm";
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
import { recordConversion } from "../services/paid-media/conversions/capi.js";
import { getPublicPixelConfig } from "../services/paid-media/conversions/pixel-config.js";
import { encryptSecret } from "../services/paid-media/secrets.js";
import { readClickIds } from "../middleware/clickIdCapture.js";
import { WorkspaceForbiddenError } from "../services/studio/workspace.js";
import { listAccessibleWorkspaces } from "../services/studio/workspace.js";

export const paidMediaRoutes = new Hono<AppEnv>();

function uid(c: any): string {
  return c.var.user?.sub as string;
}

function env(c: any): PaidMediaEnv & { JWT_SECRET?: string; FRONTEND_URL?: string; BASE_URL?: string } {
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
        return c.json(error("WORKSPACE_FORBIDDEN", err.message), 403);
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[paid-media]", msg);
      return c.json(error("INTERNAL", msg), 500);
    });
}

// ─── Platform discovery ───────────────────────────────────────────────────
paidMediaRoutes.get("/platforms", (c) => {
  return c.json(success(listAdapters(env(c))));
});

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
  const userId = uid(c);
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
  const frontendUrl = (env(c).FRONTEND_URL ?? "https://hired.video").split(",")[0];
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
paidMediaRoutes.get("/connections", async (c) => withinErrorHandling(c, async () => {
  const actorUserId = uid(c);
  const d = getDb();
  const ws = await listAccessibleWorkspaces(actorUserId, { db: d });
  const allowedUserIds = [actorUserId, ...ws.delegatedSubjectUserIds];
  const ownership = or(
    and(inArray(schema.paidMediaConnections.userId, allowedUserIds), isNull(schema.paidMediaConnections.companyId)),
    ws.companyIds.length ? inArray(schema.paidMediaConnections.companyId, ws.companyIds) : undefined,
  );
  const conns = await d.select({
    id: schema.paidMediaConnections.id,
    userId: schema.paidMediaConnections.userId,
    companyId: schema.paidMediaConnections.companyId,
    platform: schema.paidMediaConnections.platform,
    externalUserId: schema.paidMediaConnections.externalUserId,
    externalUserHandle: schema.paidMediaConnections.externalUserHandle,
    scopes: schema.paidMediaConnections.scopes,
    status: schema.paidMediaConnections.status,
    lastSyncedAt: schema.paidMediaConnections.lastSyncedAt,
    lastError: schema.paidMediaConnections.lastError,
    accessTokenExpiresAt: schema.paidMediaConnections.accessTokenExpiresAt,
    createdAt: schema.paidMediaConnections.createdAt,
  }).from(schema.paidMediaConnections).where(ownership);
  return conns;
}));

paidMediaRoutes.delete("/connections/:id", async (c) => withinErrorHandling(c, async () => {
  const actorUserId = uid(c);
  const id = c.req.param("id");
  const d = getDb();
  const [row] = await d.select().from(schema.paidMediaConnections).where(eq(schema.paidMediaConnections.id, id)).limit(1);
  if (!row) return { deleted: false };
  // Ownership: re-use canActFor via campaign-service style — connections are workspace-owned.
  const { assertCanWrite } = await import("../services/studio/workspace.js");
  await assertCanWrite(actorUserId, row.userId, row.companyId, { db: d });
  await d.delete(schema.paidMediaConnections).where(eq(schema.paidMediaConnections.id, id));
  return { deleted: true };
}));

paidMediaRoutes.get("/accounts", async (c) => withinErrorHandling(c, async () => {
  const actorUserId = uid(c);
  const d = getDb();
  const ws = await listAccessibleWorkspaces(actorUserId, { db: d });
  const userIds = [actorUserId, ...ws.delegatedSubjectUserIds];
  const ownership = or(
    and(inArray(schema.paidMediaAccounts.userId, userIds), isNull(schema.paidMediaAccounts.companyId)),
    ws.companyIds.length ? inArray(schema.paidMediaAccounts.companyId, ws.companyIds) : undefined,
  );
  return d.select().from(schema.paidMediaAccounts).where(ownership);
}));

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
  listCampaigns(uid(c), workspaceFromQuery(c)),
));

paidMediaRoutes.post("/campaigns", async (c) => withinErrorHandling(c, async () => {
  const body = CampaignCreateSchema.parse(await c.req.json());
  return createCampaign(uid(c), workspaceFromQuery(c), {
    ...body,
    startAt: body.startAt ? new Date(body.startAt) : null,
    endAt:   body.endAt   ? new Date(body.endAt)   : null,
  } as any);
}));

paidMediaRoutes.get("/campaigns/:id", async (c) => withinErrorHandling(c, () =>
  getCampaign(uid(c), c.req.param("id")),
));

paidMediaRoutes.patch("/campaigns/:id", async (c) => withinErrorHandling(c, async () => {
  const body = CampaignCreateSchema.partial().parse(await c.req.json());
  return updateCampaign(uid(c), c.req.param("id"), {
    ...body,
    startAt: body.startAt ? new Date(body.startAt) : undefined,
    endAt:   body.endAt   ? new Date(body.endAt)   : undefined,
  } as any);
}));

paidMediaRoutes.delete("/campaigns/:id", async (c) => withinErrorHandling(c, async () => {
  await deleteCampaign(uid(c), c.req.param("id"));
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
  listAdSets(uid(c), c.req.param("id")),
));

paidMediaRoutes.post("/campaigns/:id/ad-sets", async (c) => withinErrorHandling(c, async () => {
  const body = AdSetCreateSchema.parse(await c.req.json());
  return createAdSet(uid(c), c.req.param("id"), {
    ...body,
    startAt: body.startAt ? new Date(body.startAt) : null,
    endAt:   body.endAt   ? new Date(body.endAt)   : null,
  } as any);
}));

paidMediaRoutes.patch("/ad-sets/:id", async (c) => withinErrorHandling(c, async () => {
  const body = AdSetCreateSchema.partial().parse(await c.req.json());
  return updateAdSet(uid(c), c.req.param("id"), {
    ...body,
    startAt: body.startAt ? new Date(body.startAt) : undefined,
    endAt:   body.endAt   ? new Date(body.endAt)   : undefined,
  } as any);
}));

paidMediaRoutes.delete("/ad-sets/:id", async (c) => withinErrorHandling(c, async () => {
  await deleteAdSet(uid(c), c.req.param("id"));
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
  listAds(uid(c), c.req.param("id")),
));

paidMediaRoutes.post("/ad-sets/:id/ads", async (c) => withinErrorHandling(c, async () => {
  const body = AdCreateSchema.parse(await c.req.json());
  return createAd(uid(c), c.req.param("id"), body as any);
}));

paidMediaRoutes.patch("/ads/:id", async (c) => withinErrorHandling(c, async () => {
  const body = AdCreateSchema.partial().parse(await c.req.json());
  return updateAd(uid(c), c.req.param("id"), body as any);
}));

paidMediaRoutes.delete("/ads/:id", async (c) => withinErrorHandling(c, async () => {
  await deleteAd(uid(c), c.req.param("id"));
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
  listCreatives(uid(c), workspaceFromQuery(c)),
));

paidMediaRoutes.post("/creatives", async (c) => withinErrorHandling(c, async () => {
  const body = CreativeCreateSchema.parse(await c.req.json());
  return createCreative(uid(c), workspaceFromQuery(c), body as any);
}));

paidMediaRoutes.patch("/creatives/:id", async (c) => withinErrorHandling(c, async () => {
  const body = CreativeCreateSchema.partial().parse(await c.req.json());
  return updateCreative(uid(c), c.req.param("id"), body as any);
}));

paidMediaRoutes.delete("/creatives/:id", async (c) => withinErrorHandling(c, async () => {
  await deleteCreative(uid(c), c.req.param("id"));
  return { deleted: true };
}));

// ─── Sync ─────────────────────────────────────────────────────────────────
const SyncCampaignSchema = z.object({ accountId: UuidLikeSchema });

paidMediaRoutes.post("/campaigns/:id/sync", async (c) => withinErrorHandling(c, async () => {
  const { accountId } = SyncCampaignSchema.parse(await c.req.json());
  // Ensure actor owns the campaign — loads + asserts.
  await getCampaign(uid(c), c.req.param("id"));
  return syncCampaignToAccount({ env: env(c) }, c.req.param("id"), accountId);
}));

paidMediaRoutes.post("/ad-sets/:id/sync", async (c) => withinErrorHandling(c, async () => {
  const { accountId } = SyncCampaignSchema.parse(await c.req.json());
  return syncAdSetToAccount({ env: env(c) }, c.req.param("id"), accountId);
}));

paidMediaRoutes.post("/creatives/:id/sync", async (c) => withinErrorHandling(c, async () => {
  const { accountId } = SyncCampaignSchema.parse(await c.req.json());
  return syncCreativeToAccount({ env: env(c) }, c.req.param("id"), accountId);
}));

paidMediaRoutes.post("/ads/:id/sync", async (c) => withinErrorHandling(c, async () => {
  const { accountId } = SyncCampaignSchema.parse(await c.req.json());
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
  return pullInsightsFromAccount({ env: env(c) }, body);
}));

paidMediaRoutes.get("/insights", async (c) => withinErrorHandling(c, async () => {
  const since = c.req.query("since");
  const until = c.req.query("until");
  const internalId = c.req.query("internalId");
  const d = getDb();
  const conds = [];
  if (since) conds.push(gte(schema.paidMediaInsights.date, since));
  if (until) conds.push(lte(schema.paidMediaInsights.date, until));
  if (internalId) conds.push(eq(schema.paidMediaInsights.internalId, internalId));
  return d.select().from(schema.paidMediaInsights).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.paidMediaInsights.date));
}));

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

paidMediaRoutes.get("/pixels", async (c) => withinErrorHandling(c, async () => {
  const actorUserId = uid(c);
  const ws = workspaceFromQuery(c);
  const { resolveWorkspaceForWrite } = await import("../services/studio/workspace.js");
  const ctx = await resolveWorkspaceForWrite(actorUserId, ws);
  const d = getDb();
  const [row] = await d.select().from(schema.paidMediaPixels)
    .where(
      and(
        eq(schema.paidMediaPixels.userId, ctx.ownerUserId),
        ctx.ownerCompanyId ? eq(schema.paidMediaPixels.companyId, ctx.ownerCompanyId) : isNull(schema.paidMediaPixels.companyId),
      ),
    )
    .limit(1);
  if (!row) return { configured: false };
  // Strip encrypted fields before returning.
  const { metaCapiTokenEnc, tiktokAccessTokenEnc, linkedInCapiTokenEnc, bingUetApiTokenEnc, ga4ApiSecretEnc, ...safe } = row;
  return {
    configured: true,
    ...safe,
    metaCapiTokenSet:      Boolean(metaCapiTokenEnc),
    tiktokAccessTokenSet:  Boolean(tiktokAccessTokenEnc),
    linkedInCapiTokenSet:  Boolean(linkedInCapiTokenEnc),
    bingUetApiTokenSet:    Boolean(bingUetApiTokenEnc),
    ga4ApiSecretSet:       Boolean(ga4ApiSecretEnc),
  };
}));

paidMediaRoutes.put("/pixels", async (c) => withinErrorHandling(c, async () => {
  const actorUserId = uid(c);
  const ws = workspaceFromQuery(c);
  const body = PixelUpdateSchema.parse(await c.req.json());
  const { resolveWorkspaceForWrite } = await import("../services/studio/workspace.js");
  const ctx = await resolveWorkspaceForWrite(actorUserId, ws);
  const d = getDb();
  const e = env(c);
  const valuesBase: Record<string, unknown> = {
    userId:                   ctx.ownerUserId,
    companyId:                ctx.ownerCompanyId,
    metaPixelId:              body.metaPixelId ?? null,
    googleAdsConversionId:    body.googleAdsConversionId ?? null,
    googleAdsConversionLabel: body.googleAdsConversionLabel ?? null,
    ga4MeasurementId:         body.ga4MeasurementId ?? null,
    linkedInPartnerId:        body.linkedInPartnerId ?? null,
    tiktokPixelId:            body.tiktokPixelId ?? null,
    bingUetTagId:             body.bingUetTagId ?? null,
    updatedAt:                new Date(),
  };
  // Encrypt secret tokens only when supplied (empty string = clear).
  if (body.metaCapiToken !== undefined)     valuesBase.metaCapiTokenEnc    = body.metaCapiToken    ? await encryptSecret(e, body.metaCapiToken)    : null;
  if (body.tiktokAccessToken !== undefined) valuesBase.tiktokAccessTokenEnc = body.tiktokAccessToken ? await encryptSecret(e, body.tiktokAccessToken) : null;
  if (body.linkedInCapiToken !== undefined) valuesBase.linkedInCapiTokenEnc = body.linkedInCapiToken ? await encryptSecret(e, body.linkedInCapiToken) : null;
  if (body.bingUetApiToken !== undefined)   valuesBase.bingUetApiTokenEnc  = body.bingUetApiToken  ? await encryptSecret(e, body.bingUetApiToken)  : null;
  if (body.ga4ApiSecret !== undefined)      valuesBase.ga4ApiSecretEnc     = body.ga4ApiSecret     ? await encryptSecret(e, body.ga4ApiSecret)     : null;
  await d.insert(schema.paidMediaPixels).values(valuesBase as any).onConflictDoUpdate({
    target: [schema.paidMediaPixels.userId, schema.paidMediaPixels.companyId],
    set: valuesBase as any,
  });
  return { saved: true };
}));

/** Public pixel config — the frontend reads this from app shell to
 *  inject pixel snippets at runtime. The route is public when no
 *  workspace param is given (returns the house workspace's config). */
paidMediaRoutes.get("/pixels/public", async (c) => withinErrorHandling(c, async () => {
  const workspaceUserId = c.req.query("workspaceUserId") ?? null;
  const workspaceCompanyId = c.req.query("workspaceCompanyId") ?? null;
  if (!workspaceUserId) {
    // House config — driven by HOUSE_USER_ID env when set; otherwise
    // first pixel row with companyId IS NULL.
    const d = getDb();
    const [row] = await d.select().from(schema.paidMediaPixels).where(isNull(schema.paidMediaPixels.companyId)).limit(1);
    if (!row) return { configured: false };
    return getPublicPixelConfig(d, row.userId, null);
  }
  const d = getDb();
  return getPublicPixelConfig(d, workspaceUserId, workspaceCompanyId);
}));

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
  return recordConversion({ db: getDb(), env: env(c) }, {
    workspaceUserId:    body.workspaceUserId,
    workspaceCompanyId: body.workspaceCompanyId ?? null,
    userId:             uid(c),
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
