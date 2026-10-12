/**
 * Typed client for /api/resume-versions — the master / version surface the
 * the kit workspace reviews use (rules live server-side in services/resume/lineage.ts):
 *
 *   lineage(id)          ★ master / version of ★ master / standalone, % different, stale
 *   saveVersion(id, …)   save content as a version of :id's MASTER
 *   markSynced(id)       a version took its master's content in
 *   addToMaster(facts)   write confirmed gap answers to the master
 *   draftFromJob(req)    a résumé for a job built from the master's evidence (not saved)
 */
import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import type { ResumeContent } from "@shared/resume";
import { ResumeLineageSchema, type ResumeLineage } from "@shared/resume-lineage";
import type { ConfirmedFact } from "@shared/resume-tailor";
import { FromJobDraftSchema, type FromJobDraft, type FromJobRequest } from "@shared/resume-from-job";

const SavedVersionSchema = z.object({ resumeId: z.string(), title: z.string(), masterId: z.string().nullable() });
export type SavedVersion = z.infer<typeof SavedVersionSchema>;

class ResumeVersionsService {
  async lineage(resumeId: string): Promise<ResumeLineage> {
    const res = await apiClient.get<ResumeLineage>(`/api/resume-versions/${resumeId}/lineage`, ResumeLineageSchema);
    return res.data;
  }

  async saveVersion(
    sourceResumeId: string,
    body: { content: ResumeContent; title?: string; description?: string },
  ): Promise<SavedVersion> {
    const res = await apiClient.post<SavedVersion>(`/api/resume-versions/${sourceResumeId}/versions`, body, SavedVersionSchema);
    return res.data;
  }

  async markSynced(versionId: string): Promise<void> {
    await apiClient.post(`/api/resume-versions/${versionId}/synced`, {}, z.object({ synced: z.boolean() }));
  }

  async addToMaster(facts: readonly ConfirmedFact[]): Promise<{ masterId: string; changed: boolean }> {
    const res = await apiClient.post<{ masterId: string; changed: boolean }>(
      "/api/resume-versions/master/facts",
      { facts },
      z.object({ masterId: z.string(), changed: z.boolean() }),
    );
    return res.data;
  }

  async draftFromJob(req: FromJobRequest): Promise<FromJobDraft> {
    const res = await apiClient.request<FromJobDraft>(
      "/api/resume-versions/from-job",
      // Reading the job + mapping evidence is one long model call.
      { method: "POST", body: req, timeout: 120_000 },
      FromJobDraftSchema,
    );
    return res.data;
  }
}

export const resumeVersionsService = new ResumeVersionsService();
