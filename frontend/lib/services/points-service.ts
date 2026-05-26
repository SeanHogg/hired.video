import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import { USER_ROLES } from "@shared/user-roles";

/** SSoT for points eligibility. job_seeker / recruiter / employer all
 *  have catalog entries since the Phase-5 widen. Consumers (widget +
 *  page + any future surface) check this — never re-implement the role
 *  test. The role-string overload exists so callers that work with an
 *  effective role (impersonation > preview > real role) can gate
 *  without re-deriving a `user` shape. */
export function isPointsEligibleRole(role: string | null | undefined): boolean {
  return (
    role === USER_ROLES.JOB_SEEKER ||
    role === USER_ROLES.RECRUITER ||
    role === USER_ROLES.EMPLOYER
  );
}
export function isPointsEligible(user: { role?: string | null } | null | undefined): boolean {
  return isPointsEligibleRole(user?.role);
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
  isRepeatable: z.boolean().default(false),
  earned: z.boolean(),
  earnedAt: z.union([z.string(), z.null()]).optional(),
  earnCount: z.number().default(0),
  earnedHistory: z.array(z.string()).default([]),
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
  kind: z.enum(["ai_credits", "premium_month", "gift_card", "campaign_dollars"]),
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

/** Shape returned by the public /api/points/badges endpoint. Lighter
 *  than the per-user `PointsBadge` (no `earned` / `earnCount` etc.) —
 *  surfaces just the catalog. */
const ShowcaseBadgeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  tier: z.string(),
  iconKey: z.string().nullable().optional(),
  pointsReward: z.number(),
  roles: z.array(z.string()),
  isRepeatable: z.boolean(),
});
export type ShowcaseBadge = z.infer<typeof ShowcaseBadgeSchema>;

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

  /** Public badge catalog. No auth required — drives the /rewards
   *  article so anonymous visitors see what they could win. Returns
   *  every active badge in the system, tier-sorted bronze → gold. */
  async listAllBadges(): Promise<ShowcaseBadge[]> {
    const res: ApiSuccessResponse<{ badges: ShowcaseBadge[] }> = await apiClient.get(
      "/api/points/badges",
      z.object({ badges: z.array(ShowcaseBadgeSchema) }),
    );
    return res.data.badges;
  },

  /** Ping the daily session. Idempotent — backend dedups by UTC day. */
  async pingSession(): Promise<{ awarded: boolean; delta: number }> {
    const res = await apiClient.post<{ awarded: boolean; delta: number; balance?: number; reason?: string }>(
      "/api/points/session/ping",
      {},
    );
    return { awarded: res.data.awarded, delta: res.data.delta ?? 0 };
  },

  /** Redeem points for an SKU. For `gift_card` kinds the caller must
   *  supply `recipientName` + `recipientEmail` (Tremendous delivers to
   *  these). Returns the outcome (fulfilled / queued / pending_kyc) or
   *  throws on rejection so React Query surfaces it. */
  async redeem(args: {
    skuId: string;
    recipientName?: string;
    recipientEmail?: string;
  }): Promise<RedeemResponse> {
    const res = await apiClient.post<RedeemResponse>("/api/points/redeem", args);
    return res.data;
  },

  /** User's redemption history. */
  async getRedemptions(): Promise<UserRedemption[]> {
    const res: ApiSuccessResponse<{ redemptions: UserRedemption[] }> = await apiClient.get(
      "/api/points/redemptions",
      z.object({ redemptions: z.array(RedemptionRowSchema) }),
    );
    return res.data.redemptions;
  },
};

const RedemptionRowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  skuId: z.string(),
  kind: z.string(),
  pointsCost: z.number(),
  valueCents: z.number(),
  status: z.string(),
  vendorOrderId: z.string().nullable().optional(),
  fulfilledAt: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  requiresKyc: z.boolean(),
  kycCompletedAt: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  grantPayload: z.unknown().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserRedemption = z.infer<typeof RedemptionRowSchema>;

export interface RedeemResponse {
  status: "fulfilled" | "queued" | "pending_kyc";
  redemptionId: string;
  redemption: UserRedemption;
}

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

  // ── Redemption queue ───────────────────────────────────────────────

  async getRedemptions(status?: string, limit = 100): Promise<UserRedemption[]> {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    qs.set("limit", String(limit));
    const res: ApiSuccessResponse<{ redemptions: UserRedemption[] }> = await apiClient.get(
      `${ADMIN_BASE}/redemptions?${qs.toString()}`,
      z.object({ redemptions: z.array(RedemptionRowSchema) }),
    );
    return res.data.redemptions;
  },

  async approveRedemption(
    id: string,
    args: { recipientName?: string; recipientEmail?: string } = {},
  ): Promise<void> {
    await apiClient.post(`${ADMIN_BASE}/redemptions/${id}/approve`, args);
  },

  async cancelRedemption(id: string, reason: string): Promise<void> {
    await apiClient.post(`${ADMIN_BASE}/redemptions/${id}/cancel`, { reason });
  },

  async markW9(args: {
    userId: string;
    legalName: string;
    taxIdLast4: string;
    taxClassification: "personal" | "business";
  }): Promise<void> {
    await apiClient.post(`${ADMIN_BASE}/user/${args.userId}/w9`, {
      legalName: args.legalName,
      taxIdLast4: args.taxIdLast4,
      taxClassification: args.taxClassification,
    });
  },
};
