/**
 * Content-abuse (moderation) reports client. Wraps `/api/moderation/reports`
 * (user) + `/api/moderation/reports/admin/*` (SuperAdmin) endpoints with typed inputs and zod-validated responses. All enums come
 * from `shared/moderation.ts` so the dialog picker and the admin queue
 * filter use the same source of truth as the backend.
 */
import { z } from "zod";
import { apiClient } from "../api-client";
import {
  REPORT_ENTITY_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
  type ReportEntityType,
  type ReportReason,
  type ReportStatus,
} from "@shared/moderation";

// ─── Schemas ────────────────────────────────────────────────────────────────

export const ContentReportSchema = z.object({
  id: z.string(),
  reporterId: z.string(),
  entityType: z.enum(REPORT_ENTITY_TYPES),
  entityId: z.string(),
  entityOwnerId: z.string().nullable().optional(),
  reason: z.enum(REPORT_REASONS),
  notes: z.string().nullable().optional(),
  status: z.enum(REPORT_STATUSES),
  resolvedBy: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  // Returned by fileReport — true when this call created the row, false
  // when an existing pending/reviewing report was reused.
  created: z.boolean().optional(),
});

export type ContentReport = z.infer<typeof ContentReportSchema>;

const QueueUserSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

export const AdminQueueRowSchema = z.object({
  report: ContentReportSchema,
  reporter: QueueUserSchema,
  owner: QueueUserSchema.nullable().optional(),
});

export type AdminQueueRow = z.infer<typeof AdminQueueRowSchema>;

// ─── Service ────────────────────────────────────────────────────────────────

export const reportsService = {
  /** File a content-abuse report. Idempotent — re-filing the same
   *  (entityType, entityId) pair while a previous report is still
   *  pending/reviewing returns the existing row with `created=false`. */
  async file(input: {
    entityType: ReportEntityType;
    entityId: string;
    reason: ReportReason;
    notes?: string;
  }): Promise<ContentReport> {
    const res = await apiClient.post<ContentReport>("/api/moderation/reports", input);
    return ContentReportSchema.parse(res.data);
  },

  async listMine(): Promise<ContentReport[]> {
    const res = await apiClient.get<ContentReport[]>("/api/moderation/reports/me");
    return z.array(ContentReportSchema).parse(res.data ?? []);
  },

  // ── Admin (SuperAdmin only — guarded by middleware on the API side) ──

  async listQueue(opts: { status?: ReportStatus; limit?: number } = {}): Promise<AdminQueueRow[]> {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.limit != null) params.set("limit", String(opts.limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await apiClient.get<AdminQueueRow[]>(`/api/moderation/reports/admin/queue${qs}`);
    return z.array(AdminQueueRowSchema).parse(res.data ?? []);
  },

  async resolve(
    reportId: string,
    input: {
      status: Exclude<ReportStatus, "pending">;
      resolution?: string;
    },
  ): Promise<ContentReport> {
    const res = await apiClient.patch<ContentReport>(
      `/api/moderation/reports/admin/${reportId}/resolve`,
      input,
    );
    return ContentReportSchema.parse(res.data);
  },
};
