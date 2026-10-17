/**
 * Typed client for the master / version surface the kit workspace reviews
 * use (rules live server-side in services/resume/lineage.ts):
 *
 *   lineage(id)          ★ master / version of ★ master / standalone, % different, stale
 *                        — GET /api/resumes/:id/versions/lineage
 *   saveVersion(id, …)   save content as a version of :id's MASTER
 *                        — POST /api/resumes { source: "variation" }
 *   markSynced(id)       a version took its master's content in
 *                        — POST /api/resumes/:id/versions/synced
 *   addToMaster(facts)   write confirmed gap answers to the master
 *                        — POST /api/resumes/master/facts
 *   draftFromJob(req)    a résumé for a job built from the master's evidence (not saved)
 *                        — POST /api/resumes { source: "job" }
 */
import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import { ResumeSchema, type ResumeContent } from "@shared/resume";
import { ResumeLineageSchema, type ResumeLineage } from "@shared/resume-lineage";
import type { ConfirmedFact } from "@shared/resume-tailor";
import { FromJobDraftSchema, type FromJobDraft, type FromJobRequest } from "@shared/resume-from-job";

const CreatedVariationSchema = ResumeSchema.extend({ masterId: z.string() });
type CreatedVariation = z.infer<typeof CreatedVariationSchema>;

export interface SavedVersion {
  resumeId: string;
  title: string;
  masterId: string | null;
}

class ResumeVersionsService {
  async lineage(resumeId: string): Promise<ResumeLineage> {
    const res = await apiClient.get<ResumeLineage>(`/api/resumes/${resumeId}/versions/lineage`, ResumeLineageSchema);
    return res.data;
  }

  async saveVersion(
    sourceResumeId: string,
    body: { content: ResumeContent; title?: string; description?: string },
  ): Promise<SavedVersion> {
    const res = await apiClient.post<CreatedVariation>(
      "/api/resumes",
      { source: "variation", sourceId: sourceResumeId, ...body },
      CreatedVariationSchema,
    );
    return { resumeId: res.data.id, title: res.data.title, masterId: res.data.masterId };
  }

  async markSynced(versionId: string): Promise<void> {
    await apiClient.post(`/api/resumes/${versionId}/versions/synced`, {}, z.object({ synced: z.boolean() }));
  }

  async addToMaster(facts: readonly ConfirmedFact[]): Promise<{ masterId: string; changed: boolean }> {
    const res = await apiClient.post<{ masterId: string; changed: boolean }>(
      "/api/resumes/master/facts",
      { facts },
      z.object({ masterId: z.string(), changed: z.boolean() }),
    );
    return res.data;
  }

  async draftFromJob(req: FromJobRequest): Promise<FromJobDraft> {
    const res = await apiClient.request<FromJobDraft>(
      "/api/resumes",
      // Reading the job + mapping evidence is one long model call.
      { method: "POST", body: { source: "job", ...req }, timeout: 120_000 },
      FromJobDraftSchema,
    );
    return res.data;
  }
}

export const resumeVersionsService = new ResumeVersionsService();
