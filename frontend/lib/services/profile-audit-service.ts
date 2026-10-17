/**
 * Profile Audit Service — frontend wrapper for the `profile-audit` AI tool
 * (POST /api/ai/tools/profile-audit).
 *
 * Mirrors the shape returned by api/src/services/profile/ProfileAuditService.ts.
 * Validates the response with Zod so a malformed payload surfaces as a
 * ValidationError instead of an undefined-field crash deeper in the page.
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { aiToolPath } from "@shared/ai-tools/tool-ids";

const SnapshotSchema = z.object({
  fullName: z.string(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  currentRole: z.string().nullable(),
  currentCompany: z.string().nullable(),
  location: z.string().nullable(),
  skills: z.array(z.string()),
  industries: z.array(z.string()),
  yearsOfExperience: z.number().nullable(),
  openToWork: z.boolean(),
  avatarUrl: z.string().nullable(),
  lastActiveAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  role: z.string().nullable(),
});

const CheckSchema = z.object({
  id: z.enum(["headline", "skim", "activity", "openToWork", "avatar"]),
  label: z.string(),
  status: z.enum(["pass", "warn", "fail"]),
  detail: z.string(),
});

const AuditResultSchema = z.object({
  current: SnapshotSchema,
  proposed: z.object({
    headline: z.string(),
    summary: z.string(),
    currentRole: z.string().nullable(),
  }),
  rationales: z.object({
    headline: z.string(),
    summary: z.string(),
    topFix: z.string(),
  }),
  checks: z.array(CheckSchema),
  score: z.number(),
});

export type ProfileAuditSnapshot = z.infer<typeof SnapshotSchema>;
export type ProfileAuditCheck = z.infer<typeof CheckSchema>;
export type ProfileAuditResult = z.infer<typeof AuditResultSchema>;

export class ProfileAuditService {
  /**
   * Run an AI audit of the authenticated user's profile. Pro-gated server-
   * side; the page also gates client-side on `useSubscription().isPro`.
   * The result includes the current snapshot, the proposed rewrite, the
   * 5-check audit, and a 0–100 score.
   */
  async run(): Promise<ProfileAuditResult> {
    const response = await apiClient.post<ProfileAuditResult>(
      aiToolPath("profile-audit"),
      {},
      AuditResultSchema,
    );
    return response.data;
  }
}

export const profileAuditService = new ProfileAuditService();
