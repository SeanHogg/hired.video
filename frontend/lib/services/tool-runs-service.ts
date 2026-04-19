// Frontend service for the polymorphic /api/tool-runs endpoints.

import { z } from "zod";
import { apiClient } from "../api-client";
import type { ToolEntityType } from "@/lib/tools/types";

export const ToolRunSchema = z.object({
  id: z.string(),
  userId: z.string(),
  toolId: z.string(),
  resumeId: z.string().nullable().optional(),
  jobId: z.string().nullable().optional(),
  videoId: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  score: z.union([z.number(), z.string()]).nullable().optional(),
  tokensUsed: z.number().nullable().optional(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  summary: z.string().nullable().optional(),
  jobDescription: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type ToolRun = z.infer<typeof ToolRunSchema>;

/** Entity references the caller supplies when recording a run. */
export interface ToolRunEntityRefs {
  resumeId?: string;
  jobId?: string;
  videoId?: string;
  templateId?: string;
  companyId?: string;
}

export interface CreateToolRunInput extends ToolRunEntityRefs {
  toolId: string;
  score?: number | null;
  result: Record<string, unknown>;
  summary?: string | null;
  jobDescription?: string | null;
}

class ToolRunsService {
  async create(input: CreateToolRunInput): Promise<ToolRun> {
    const response = await apiClient.post<ToolRun>(
      "/api/tool-runs",
      input,
      ToolRunSchema,
    );
    return response.data;
  }

  /** Admin-scoped fetch: return tool runs for a specific user. Hits the
   *  SuperAdmin router (/api/admin/impersonate/tool-usage/runs) — caller
   *  must have SA permissions or the request 403s. Used by the "Tools
   *  used" slide-out on /admin/users. */
  async listForUser(params: { userId: string; toolId?: string; limit?: number }): Promise<ToolRun[]> {
    const search = new URLSearchParams();
    search.set("userId", params.userId);
    if (params.toolId) search.set("toolId", params.toolId);
    if (params.limit) search.set("limit", String(params.limit));

    const response = await apiClient.get<ToolRun[]>(
      `/api/admin/impersonate/tool-usage/runs?${search.toString()}`,
      z.array(ToolRunSchema),
    );
    return response.data;
  }

  /** List the caller's own tool runs across every anchor (entity or
   *  anchor-less). Used by the "View History" button on the full-page
   *  tool views, where the natural scope is "my runs of this tool". */
  async listMine(params: { toolId?: string; limit?: number } = {}): Promise<ToolRun[]> {
    const search = new URLSearchParams();
    if (params.toolId) search.set("toolId", params.toolId);
    if (params.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    const response = await apiClient.get<ToolRun[]>(
      qs ? `/api/tool-runs/mine?${qs}` : "/api/tool-runs/mine",
      z.array(ToolRunSchema),
    );
    return response.data;
  }

  /** List all tool runs attached to one specific entity (any tool). */
  async listForEntity(params: { entityType: ToolEntityType; entityId: string; toolId?: string; limit?: number }): Promise<ToolRun[]> {
    const search = new URLSearchParams();
    search.set("entityType", params.entityType);
    search.set("entityId", params.entityId);
    if (params.toolId) search.set("toolId", params.toolId);
    if (params.limit) search.set("limit", String(params.limit));

    const response = await apiClient.get<ToolRun[]>(
      `/api/tool-runs?${search.toString()}`,
      z.array(ToolRunSchema),
    );
    return response.data;
  }

  async get(id: string): Promise<ToolRun> {
    const response = await apiClient.get<ToolRun>(`/api/tool-runs/${id}`, ToolRunSchema);
    return response.data;
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/tool-runs/${id}`);
  }
}

export const toolRunsService = new ToolRunsService();

/** Normalize numeric-or-string score from the DB into a number (or null). */
export function toolRunScore(run: Pick<ToolRun, "score">): number | null {
  if (run.score == null) return null;
  const n = typeof run.score === "number" ? run.score : Number.parseFloat(run.score);
  return Number.isFinite(n) ? n : null;
}
