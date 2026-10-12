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

// Schemas are the single source of truth — types are derived via
// `z.infer<...>` so the runtime validator and the TS type can never
// drift apart. Manual `interface VendorConnectorListItem { ... }`
// duplicates that drifted on optional/null shape — see commit history.

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
export type VendorConnectorListItem = z.infer<typeof VendorConnectorListItemSchema>;

const ConnectorsResponseSchema = z.object({
  connectors: z.array(VendorConnectorListItemSchema),
});

const ExportBlockSchema = z.object({
  section: z.string(),
  subSection: z.string().optional(),
  text: z.string(),
  format: z.enum(["plain", "markdown"]).optional(),
  charLimit: z.number().optional(),
  openTargetUrl: z.string().optional(),
  autofillSelector: z.string().optional(),
  /** Multi-field write-back walked one user-confirmed step at a time
   *  (LinkedIn "Add position": title → company → description). */
  autofillSteps: z
    .array(
      z.object({
        field: z.enum(["title", "company", "location", "description", "skill"]),
        selector: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
});
export type ExportBlock = z.infer<typeof ExportBlockSchema>;
export type AutofillStep = NonNullable<ExportBlock["autofillSteps"]>[number];

const BlocksResponseSchema = z.object({
  connectorId: z.string(),
  resumeId: z.string(),
  resumeTitle: z.string(),
  editProfileUrl: z.string(),
  blocks: z.array(ExportBlockSchema),
});

const ImportResponseSchema = z.object({
  syncRunId: z.string(),
  sourceContent: z.record(z.string(), z.unknown()),
  targetContent: z.record(z.string(), z.unknown()),
  // Re-validated as MergeAnalysis at the consumer boundary
  // (MergeResumeDialog) — kept loose here so this client doesn't fork
  // the merge schema. The exported `VendorImportResult` type narrows
  // `analysis` to MergeAnalysis for the React props that consume it.
  analysis: z.unknown(),
});
export type VendorImportResult = Omit<z.infer<typeof ImportResponseSchema>, "analysis"> & {
  analysis: MergeAnalysis;
};

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
type ExecuteResponse = z.infer<typeof ExecuteResponseSchema>;

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
export type VendorSyncRun = z.infer<typeof SyncRunSchema>;

// Generics elided on every apiClient call — the schema is the single
// source of truth, so let TS infer the response type from the schema's
// `_output`. A redundant explicit `<T>` was the cause of the recurring
// drift errors when the manual `T` and the schema disagreed on
// optional/null shape.
const RunsResponseSchema = z.object({ runs: z.array(SyncRunSchema) });
const RunResponseSchema = z.object({ run: SyncRunSchema });

export const vendorSyncService = {
  async listConnectors(): Promise<VendorConnectorListItem[]> {
    const res = await apiClient.get(
      "/api/vendor-sync/connectors",
      ConnectorsResponseSchema,
    );
    return res.data.connectors;
  },

  async renderBlocks(connectorId: string, resumeId: string): Promise<z.infer<typeof BlocksResponseSchema>> {
    const res = await apiClient.post(
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
    const res = await apiClient.post(
      `/api/vendor-sync/${encodeURIComponent(connectorId)}/import`,
      args,
      ImportResponseSchema,
    );
    return res.data as VendorImportResult;
  },

  async executeMerge(
    connectorId: string,
    body: VendorExecuteRequest,
  ): Promise<ExecuteResponse> {
    const res = await apiClient.post(
      `/api/vendor-sync/${encodeURIComponent(connectorId)}/execute`,
      body,
      ExecuteResponseSchema,
    );
    return res.data;
  },

  async markManualRun(args: { connectorId: string; sourceResumeId: string; notes?: string }): Promise<VendorSyncRun> {
    const res = await apiClient.post(
      "/api/vendor-sync/runs",
      args,
      RunResponseSchema,
    );
    return res.data.run;
  },

  async listRuns(args: { connectorId?: string; resumeId?: string; limit?: number } = {}): Promise<VendorSyncRun[]> {
    const params = new URLSearchParams();
    if (args.connectorId) params.set("connectorId", args.connectorId);
    if (args.resumeId) params.set("resumeId", args.resumeId);
    if (args.limit) params.set("limit", String(args.limit));
    const qs = params.toString();
    const res = await apiClient.get(
      `/api/vendor-sync/runs${qs ? `?${qs}` : ""}`,
      RunsResponseSchema,
    );
    return res.data.runs;
  },
};
