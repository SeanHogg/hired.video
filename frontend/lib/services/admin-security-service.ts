/**
 * Admin security service — single source of truth for the SuperAdmin
 * security surface (locked accounts, bot stats, region waitlist).
 *
 * Every admin component (LockedAccountsPanel, BotBlockGlobe,
 * RegionWaitlistTable) imports from here so request/response shapes
 * can't drift.
 */

import { z } from "zod";
import { apiClient } from "@/lib/api-client";

export const LockedAccountSchema = z.object({
  lockId: z.string(),
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  reason: z.string(),
  lockedAt: z.string(),
  unlocksAt: z.string().nullable(),
  lockedBy: z.string().nullable(),
  notes: z.string().nullable(),
});
export type LockedAccount = z.infer<typeof LockedAccountSchema>;

const LockedListSchema = z.array(LockedAccountSchema);

export const BotStatsSchema = z.object({
  range: z.string(),
  since: z.string(),
  total: z.number(),
  byCountry: z.array(z.object({ countryCode: z.string().nullable(), count: z.number() })),
  byReason: z.array(z.object({ reason: z.string(), count: z.number() })),
});
export type BotStats = z.infer<typeof BotStatsSchema>;

export const BotEventSchema = z.object({
  id: z.string(),
  endpoint: z.string(),
  reason: z.string(),
  countryCode: z.string().nullable(),
  ipHash: z.string().nullable(),
  emailDomain: z.string().nullable(),
  asn: z.string().nullable(),
  createdAt: z.string(),
});
export type BotEvent = z.infer<typeof BotEventSchema>;

const BotEventsListSchema = z.array(BotEventSchema);

export const WaitlistEntrySchema = z.object({
  id: z.string(),
  email: z.string(),
  countryCode: z.string(),
  reason: z.string().nullable(),
  status: z.string(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type WaitlistEntry = z.infer<typeof WaitlistEntrySchema>;

const WaitlistListSchema = z.array(WaitlistEntrySchema);

export const adminSecurityService = {
  async listLockedAccounts(): Promise<LockedAccount[]> {
    const res = await apiClient.get<LockedAccount[]>("/api/admin/security/locked-accounts", LockedListSchema);
    return res.data;
  },
  async unlockAccount(userId: string): Promise<void> {
    await apiClient.post(`/api/admin/security/locked-accounts/${encodeURIComponent(userId)}/unlock`, {});
  },
  async lockAccount(userId: string, body: { reason?: string; notes?: string; durationMinutes?: number }): Promise<void> {
    await apiClient.post(`/api/admin/security/locked-accounts/${encodeURIComponent(userId)}/lock`, body);
  },
  async getBotStats(range: "1h" | "24h" | "7d" | "30d"): Promise<BotStats> {
    const res = await apiClient.get<BotStats>(`/api/admin/security/bot-stats?range=${range}`, BotStatsSchema);
    return res.data;
  },
  async listBotEvents(limit = 100): Promise<BotEvent[]> {
    const res = await apiClient.get<BotEvent[]>(`/api/admin/security/bot-events?limit=${limit}`, BotEventsListSchema);
    return res.data;
  },
  async listWaitlist(status: "pending" | "invited" | "declined" = "pending"): Promise<WaitlistEntry[]> {
    const res = await apiClient.get<WaitlistEntry[]>(`/api/admin/security/region-waitlist?status=${status}`, WaitlistListSchema);
    return res.data;
  },
  async reviewWaitlist(id: string, status: "invited" | "declined"): Promise<void> {
    await apiClient.post(`/api/admin/security/region-waitlist/${encodeURIComponent(id)}/review`, { status });
  },
};
