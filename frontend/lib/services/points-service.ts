import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import { USER_ROLES } from "@shared/user-roles";

/** SSoT for points eligibility. V1 = job_seeker only; widens when the
 *  catalog gains recruiter / employer SKUs. Consumers (widget + page +
 *  any future surface) check this — never re-implement the role test. */
export function isPointsEligible(user: { role?: string | null } | null | undefined): boolean {
  return user?.role === USER_ROLES.JOB_SEEKER;
}

/**
 * Gamification client. Mirrors the /api/points and
 * /api/admin/impersonate/points routes. Schemas are loose-enough to
 * accept the backend's date strings (Drizzle returns Date instances
 * that JSON.stringify to ISO).
 */

const BadgeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  tier: z.string(),
  iconKey: z.string().nullable().optional(),
  earned: z.boolean(),
  earnedAt: z.union([z.string(), z.null()]).optional(),
});

const ActivityItemSchema = z.object({
  id: z.string(),
  delta: z.number(),
  category: z.string(),
  action: z.string(),
  label: z.string(),
  at: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  source: z.string().optional(),
  refId: z.string().nullable().optional(),
  refType: z.string().nullable().optional(),
});

const SummarySchema = z.object({
  balance: z.number(),
  lifetimeEarned: z.number(),
  lifetimeRedeemed: z.number(),
  isSuspended: z.boolean(),
  suspendedReason: z.string().nullable(),
  streak: z.object({
    current: z.number(),
    longest: z.number(),
    lastActivityDate: z.string().nullable(),
  }),
  userTaskGate: z.object({
    completed: z.number(),
    threshold: z.number(),
    unlocked: z.boolean(),
  }),
  badges: z.array(BadgeSchema),
  recentActivity: z.array(ActivityItemSchema),
});

export type PointsBadge = z.infer<typeof BadgeSchema>;
export type PointsActivityItem = z.infer<typeof ActivityItemSchema>;
export type PointsSummary = z.infer<typeof SummarySchema>;

const ActivityListSchema = z.object({ items: z.array(ActivityItemSchema) });
export type PointsActivityList = z.infer<typeof ActivityListSchema>;

const CatalogActionSchema = z.object({
  key: z.string(),
  label: z.string(),
  roles: z.array(z.string()),
  points: z.number(),
  dailyCapPoints: z.number().nullable().optional(),
  requiresUserTaskGate: z.boolean(),
});

const CatalogRedemptionSchema = z.object({
  id: z.string(),
  kind: z.enum(["ai_credits", "premium_month", "gift_card"]),
  label: z.string(),
  pointsCost: z.number(),
});

const CatalogSchema = z.object({
  actions: z.array(CatalogActionSchema),
  redemptions: z.array(CatalogRedemptionSchema),
});

export type PointsCatalog = z.infer<typeof CatalogSchema>;
export type PointsCatalogAction = z.infer<typeof CatalogActionSchema>;
export type PointsRedemption = z.infer<typeof CatalogRedemptionSchema>;

export const pointsService = {
  async getMe(): Promise<PointsSummary> {
    const res: ApiSuccessResponse<PointsSummary> = await apiClient.get(
      "/api/points/me",
      SummarySchema,
    );
    return res.data;
  },

  async getActivity(limit = 50): Promise<PointsActivityList> {
    const res: ApiSuccessResponse<PointsActivityList> = await apiClient.get(
      `/api/points/activity?limit=${limit}`,
      ActivityListSchema,
    );
    return res.data;
  },

  async getCatalog(): Promise<PointsCatalog> {
    const res: ApiSuccessResponse<PointsCatalog> = await apiClient.get(
      "/api/points/catalog",
      CatalogSchema,
    );
    return res.data;
  },

  /** Ping the daily session. Idempotent — backend dedups by UTC day. */
  async pingSession(): Promise<{ awarded: boolean; delta: number }> {
    const res = await apiClient.post<{ awarded: boolean; delta: number; balance?: number; reason?: string }>(
      "/api/points/session/ping",
      {},
    );
    return { awarded: res.data.awarded, delta: res.data.delta ?? 0 };
  },

  /** Phase-1: backend returns 501. The caller should show "coming soon"
   *  on a 501 instead of treating it as an error. */
  async redeem(skuId: string): Promise<{ success: boolean; message?: string }> {
    try {
      await apiClient.post(`/api/points/redeem`, { skuId });
      return { success: true };
    } catch (e) {
      const err = e as { status?: number; message?: string };
      if (err.status === 501) {
        return { success: false, message: err.message ?? "Coming soon" };
      }
      throw e;
    }
  },
};

// ── SuperAdmin client ───────────────────────────────────────────────

const GlobalStatsSchema = z.object({
  totalUsers: z.number(),
  suspendedUsers: z.number(),
  totalEarned: z.number(),
  totalRedeemed: z.number(),
  totalBalance: z.number(),
  openFraudFlags: z.number(),
});

const AdminDashSchema = z.object({
  stats: GlobalStatsSchema,
  catalog: CatalogSchema,
});

const TopEarnerSchema = z.object({
  userId: z.string(),
  lifetimeEarned: z.number(),
  balance: z.number(),
});

const FraudFlagSchema = z.object({
  id: z.string(),
  userId: z.string(),
  kind: z.string(),
  severity: z.string(),
  evidence: z.unknown().nullable().optional(),
  status: z.string(),
  autoSuspended: z.boolean(),
  reviewedAt: z.string().nullable().optional(),
  reviewedBy: z.string().nullable().optional(),
  reviewerNotes: z.string().nullable().optional(),
  createdAt: z.string(),
});

const FraudQueueSchema = z.object({ flags: z.array(FraudFlagSchema) });

const AdminUserSchema = z.object({
  summary: SummarySchema,
  activity: z.array(ActivityItemSchema),
  fraudFlags: z.array(FraudFlagSchema),
});

export type PointsGlobalStats = z.infer<typeof GlobalStatsSchema>;
export type PointsAdminDashboard = z.infer<typeof AdminDashSchema>;
export type PointsTopEarner = z.infer<typeof TopEarnerSchema>;
export type PointsFraudFlag = z.infer<typeof FraudFlagSchema>;
export type PointsAdminUserView = z.infer<typeof AdminUserSchema>;

const ADMIN_BASE = "/api/admin/impersonate/points";

export const pointsAdminService = {
  async getDashboard(): Promise<PointsAdminDashboard> {
    const res: ApiSuccessResponse<PointsAdminDashboard> = await apiClient.get(
      `${ADMIN_BASE}`,
      AdminDashSchema,
    );
    return res.data;
  },

  async getTopEarners(limit = 50): Promise<PointsTopEarner[]> {
    const res: ApiSuccessResponse<{ top: PointsTopEarner[] }> = await apiClient.get(
      `${ADMIN_BASE}/top?limit=${limit}`,
      z.object({ top: z.array(TopEarnerSchema) }),
    );
    return res.data.top;
  },

  async getUser(userId: string): Promise<PointsAdminUserView> {
    const res: ApiSuccessResponse<PointsAdminUserView> = await apiClient.get(
      `${ADMIN_BASE}/user/${userId}`,
      AdminUserSchema,
    );
    return res.data;
  },

  async adjust(userId: string, delta: number, reason: string): Promise<void> {
    await apiClient.post(`${ADMIN_BASE}/user/${userId}/adjust`, { delta, reason });
  },

  async suspend(userId: string, reason: string): Promise<void> {
    await apiClient.post(`${ADMIN_BASE}/user/${userId}/suspend`, { reason });
  },

  async reinstate(userId: string): Promise<void> {
    await apiClient.post(`${ADMIN_BASE}/user/${userId}/reinstate`, {});
  },

  async getFraudQueue(limit = 100): Promise<PointsFraudFlag[]> {
    const res: ApiSuccessResponse<{ flags: PointsFraudFlag[] }> = await apiClient.get(
      `${ADMIN_BASE}/fraud/queue?limit=${limit}`,
      FraudQueueSchema,
    );
    return res.data.flags;
  },

  async resolveFraud(
    flagId: string,
    decision: "confirmed" | "dismissed",
    notes?: string,
    reinstate?: boolean,
  ): Promise<void> {
    await apiClient.post(`${ADMIN_BASE}/fraud/${flagId}/resolve`, {
      decision,
      notes,
      reinstate,
    });
  },
};
