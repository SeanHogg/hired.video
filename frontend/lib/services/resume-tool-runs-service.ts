// Frontend service for the /api/resume-tool-runs endpoints — persists and
// retrieves the history of resume-input tool runs per resume.

import { z } from "zod";
import { apiClient } from "../api-client";

export const ResumeToolRunSchema = z.object({
  id: z.string(),
  userId: z.string(),
  resumeId: z.string(),
  toolId: z.string(),
  // numeric comes back as a string from postgres; tolerate both.
  score: z.union([z.number(), z.string()]).nullable().optional(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  jobDescription: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type ResumeToolRun = z.infer<typeof ResumeToolRunSchema>;

export interface CreateResumeToolRunInput {
  resumeId: string;
  toolId: string;
  score?: number | null;
  result: Record<string, unknown>;
  jobDescription?: string | null;
  summary?: string | null;
}

class ResumeToolRunsService {
  async create(input: CreateResumeToolRunInput): Promise<ResumeToolRun> {
    const response = await apiClient.post<ResumeToolRun>(
      "/api/resume-tool-runs",
      input,
      ResumeToolRunSchema,
    );
    return response.data;
  }

  async list(params: { resumeId: string; toolId?: string; limit?: number }): Promise<ResumeToolRun[]> {
    const search = new URLSearchParams();
    search.set("resumeId", params.resumeId);
    if (params.toolId) search.set("toolId", params.toolId);
    if (params.limit) search.set("limit", String(params.limit));

    const response = await apiClient.get<ResumeToolRun[]>(
      `/api/resume-tool-runs?${search.toString()}`,
      z.array(ResumeToolRunSchema),
    );
    return response.data;
  }

  async get(id: string): Promise<ResumeToolRun> {
    const response = await apiClient.get<ResumeToolRun>(
      `/api/resume-tool-runs/${id}`,
      ResumeToolRunSchema,
    );
    return response.data;
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/resume-tool-runs/${id}`);
  }
}

export const resumeToolRunsService = new ResumeToolRunsService();

/** Normalize numeric-or-string score from the DB into a number (or null). */
export function toolRunScore(run: Pick<ResumeToolRun, "score">): number | null {
  if (run.score == null) return null;
  const n = typeof run.score === "number" ? run.score : Number.parseFloat(run.score);
  return Number.isFinite(n) ? n : null;
}
