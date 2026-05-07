/**
 * Frontend client for `/api/vendor-sync/*`.
 *
 * The tool page at `/tools/vendor-sync` and the shared `VendorCard`
 * call into this surface; nothing else should hit the routes directly.
 *
 * Shapes mirror `api/src/routes/vendor-sync.ts` 1:1. Where this overlaps
 * with the existing merge envelope (`/api/resumes/merge/from-file`),
 * the field names are kept identical so `MergeResumeDialog` can consume
 * vendor-sync results without an adapter.
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import type { MergeAnalysis } from "@/types/resume";

export interface VendorConnectorListItem {
  id: string;
  label: string;
  iconKey: string;
  category: "professional" | "job-board" | "startup" | "developer" | "portfolio";
  description: string;
  editProfileUrl: string;
  supportsExtensionExtract: boolean;
  supportsExtensionWrite: boolean;
  lastRun: {
    id: string;
    direction: "import" | "export";
    startedAt: string;
    completedAt: string | null;
  } | null;
}

const VendorConnectorListItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  iconKey: z.string(),
  category: z.enum(["professional", "job-board", "startup", "developer", "portfolio"]),
  description: z.string(),
  editProfileUrl: z.string(),
  supportsExtensionExtract: z.boolean(),
  supportsExtensionWrite: z.boolean(),
  lastRun: z.object({
    id: z.string(),
    direction: z.enum(["import", "export"]),
    startedAt: z.string(),
    completedAt: z.string().nullable(),
  }).nullable(),
});

const ConnectorsResponseSchema = z.object({
  connectors: z.array(VendorConnectorListItemSchema),
});

export interface ExportBlock {
  section: string;
  subSection?: string;
  text: string;
  format?: "plain" | "markdown";
  charLimit?: number;
}

const ExportBlockSchema = z.object({
  section: z.string(),
  subSection: z.string().optional(),
  text: z.string(),
  format: z.enum(["plain", "markdown"]).optional(),
  charLimit: z.number().optional(),
});

const BlocksResponseSchema = z.object({
  connectorId: z.string(),
  resumeId: z.string(),
  resumeTitle: z.string(),
  editProfileUrl: z.string(),
  blocks: z.array(ExportBlockSchema),
});

export interface VendorImportResult {
  syncRunId: string;
  sourceContent: Record<string, unknown>;
  targetContent: Record<string, unknown>;
  analysis: MergeAnalysis;
}

const ImportResponseSchema = z.object({
  syncRunId: z.string(),
  sourceContent: z.record(z.string(), z.unknown()),
  targetContent: z.record(z.string(), z.unknown()),
  // Re-validate as MergeAnalysis on the consumer (MergeResumeDialog)
  // side; here we accept the raw shape so we don't drift schema.
  analysis: z.unknown(),
});

export interface VendorExecuteRequest {
  syncRunId: string;
  sourceContent: Record<string, unknown>;
  targetResumeId: string;
  decisions: unknown[];
  basicDecisions?: Record<string, "source" | "target">;
  createNew: boolean;
  newTitle?: string;
}

const ExecuteResponseSchema = z.object({
  resumeId: z.string(),
  title: z.string(),
  mergedSections: z.number(),
  skippedSections: z.number(),
  newSections: z.number(),
});

export interface VendorSyncRun {
  id: string;
  connectorId: string;
  direction: "import" | "export";
  status: "pending" | "success" | "failed" | "cancelled";
  targetResumeId: string | null;
  sourceResumeId: string | null;
  sourceUrl: string | null;
  startedAt: string;
  completedAt: string | null;
  manualMarkedAt: string | null;
  notes: string | null;
}

const SyncRunSchema = z.object({
  id: z.string(),
  connectorId: z.string(),
  direction: z.enum(["import", "export"]),
  status: z.enum(["pending", "success", "failed", "cancelled"]),
  targetResumeId: z.string().nullable(),
  sourceResumeId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  manualMarkedAt: z.string().nullable(),
  notes: z.string().nullable(),
});

export const vendorSyncService = {
  async listConnectors(): Promise<VendorConnectorListItem[]> {
    const res = await apiClient.get<{ connectors: VendorConnectorListItem[] }>(
      "/api/vendor-sync/connectors",
      ConnectorsResponseSchema,
    );
    return res.data.connectors;
  },

  async renderBlocks(connectorId: string, resumeId: string): Promise<{
    connectorId: string;
    resumeId: string;
    resumeTitle: string;
    editProfileUrl: string;
    blocks: ExportBlock[];
  }> {
    const res = await apiClient.post<{
      connectorId: string;
      resumeId: string;
      resumeTitle: string;
      editProfileUrl: string;
      blocks: ExportBlock[];
    }>(
      `/api/vendor-sync/${encodeURIComponent(connectorId)}/blocks`,
      { resumeId },
      BlocksResponseSchema,
    );
    return res.data;
  },

  async importFromHtml(
    connectorId: string,
    args: { html: string; sourceUrl: string; targetResumeId: string },
  ): Promise<VendorImportResult> {
    const res = await apiClient.post<VendorImportResult>(
      `/api/vendor-sync/${encodeURIComponent(connectorId)}/import`,
      args,
      ImportResponseSchema,
    );
    return res.data as VendorImportResult;
  },

  async executeMerge(
    connectorId: string,
    body: VendorExecuteRequest,
  ): Promise<{ resumeId: string; title: string; mergedSections: number; skippedSections: number; newSections: number }> {
    const res = await apiClient.post<{
      resumeId: string; title: string; mergedSections: number; skippedSections: number; newSections: number;
    }>(
      `/api/vendor-sync/${encodeURIComponent(connectorId)}/execute`,
      body,
      ExecuteResponseSchema,
    );
    return res.data;
  },

  async markManualRun(args: { connectorId: string; sourceResumeId: string; notes?: string }): Promise<VendorSyncRun> {
    const res = await apiClient.post<{ run: VendorSyncRun }>(
      "/api/vendor-sync/runs",
      args,
      z.object({ run: SyncRunSchema }),
    );
    return res.data.run;
  },

  async listRuns(args: { connectorId?: string; resumeId?: string; limit?: number } = {}): Promise<VendorSyncRun[]> {
    const params = new URLSearchParams();
    if (args.connectorId) params.set("connectorId", args.connectorId);
    if (args.resumeId) params.set("resumeId", args.resumeId);
    if (args.limit) params.set("limit", String(args.limit));
    const qs = params.toString();
    const res = await apiClient.get<{ runs: VendorSyncRun[] }>(
      `/api/vendor-sync/runs${qs ? `?${qs}` : ""}`,
      z.object({ runs: z.array(SyncRunSchema) }),
    );
    return res.data.runs;
  },
};
