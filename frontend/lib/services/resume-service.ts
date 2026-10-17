/**
 * Resume Service
 * Handles resume-related API operations. The class is the stable facade
 * (`resumeService.<method>`); lists, state flips, AI tools and merge live in
 * sibling modules (resume-list-api / resume-state-api / resume-ai-api /
 * resume-merge-api) and are mounted here under their historical names.
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { trackJobSeekerStage } from "@/lib/analytics/jobseeker-funnel";
import { ResumeSchema, type Resume, type ResumeWithOwnership } from "@shared/resume";
import { streamResumeParse, type ResumeParseProgress } from "./resume-parse-stream";
import { toParsedResumeData } from "./resume-parse-result";
import type { ResumeData, ResumePrivacy, Resume as FrontendResume, ResumeSectionMeta } from "@/types/resume";
import { parseJsonResumeFile } from "@/lib/extract-text";
import { resolveResumeUploadPayload, resumeFilesFormData } from "./resume-upload-payload";
import * as lists from "./resume-list-api";
import * as state from "./resume-state-api";
import * as ai from "./resume-ai-api";
import * as merge from "./resume-merge-api";

// ============================================================================
// SCHEMAS
// ============================================================================

// `ResumeSchema` is re-exported from the shared contract so callers can
// import it from this service module as before. A 250-line local copy
// with legacy fields (`name`/`metaResume`/`isPrimaryDefault`/
// `privacy_ShowResume`/`resumeSerialized`) lived here until 2026-04-20;
// it silently drifted from the backend and caused every response-validation
// bug the canonical-shape refactor was meant to prevent. Never re-introduce.
export { ResumeSchema };
export { ResumeSummarySchema, PaginatedResumesSchema } from "./resume-list-api";
export type { ResumeSummary, PaginatedResumes, MasterResumeGroup } from "./resume-list-api";
export type { MergeTarget } from "./resume-merge-api";

// Canonical wire types from @shared/resume.
export type { Resume, ResumeWithOwnership };

// ============================================================================
// RESUME SERVICE CLASS
// ============================================================================

export class ResumeService {
  // Lists (resume-list-api)
  getPublicResumes = lists.getPublicResumes;
  getUserResumes = lists.getUserResumes;
  getMasterResumeGroups = lists.getMasterResumeGroups;
  getResumesWithOwnership = lists.getResumesWithOwnership;
  getResumesForDisplay = lists.getResumesForDisplay;

  // State flips + watch (resume-state-api)
  archiveResume = state.archiveResume;
  unarchiveResume = state.unarchiveResume;
  setMasterResume = state.setMasterResume;
  setActiveResume = state.setActiveResume;
  setResumePrivacy = state.setResumePrivacy;
  detachFromParent = state.detachFromParent;
  promoteVariantToMaster = state.promoteVariantToMaster;
  watchResume = state.watchResume;
  unwatchResume = state.unwatchResume;

  // AI tools (resume-ai-api)
  reviseResumeContent = ai.reviseResumeContent;
  getResumeSummary = ai.getResumeSummary;
  consolidateBullets = ai.consolidateBullets;

  // Merge (resume-merge-api)
  analyzeMerge = merge.analyzeMerge;
  executeMerge = merge.executeMerge;
  previewMerge = merge.previewMerge;
  analyzeParsedMerge = merge.analyzeParsedMerge;
  analyzeFileMerge = merge.analyzeFileMerge;

  /**
   * Get resumes for a specific user. The backend returns the public list
   * (privacyLevel=0) for non-owners and the full list for the owner.
   */
  async getResumesByUserId(userId: string): Promise<lists.ResumeSummary[]> {
    const response = await apiClient.get<lists.ResumeSummary[]>(
      `/api/users/${userId}/resumes`,
      z.array(lists.ResumeSummarySchema),
    );
    return response.data;
  }

  /**
   * Get specific resume by ID. The backend now returns the canonical
   * Resume shape (shared/resume.ts); no post-parse transform needed.
   */
  async getResumeById(id: string): Promise<FrontendResume> {
    const response = await apiClient.get<FrontendResume>(
      `/api/resumes/${id}`,
      ResumeSchema as any,
    );
    return response.data;
  }

  /** Get resume for embedding (server bypasses privacy checks for this endpoint).
   *  `partnerToken` (?pt=) is an optional partner embed token that grants read
   *  of a consented job seeker's private resume for a partner-platform embed. */
  async getResumeForEmbed(identifier: string, partnerToken?: string): Promise<FrontendResume> {
    const qs = partnerToken ? `?pt=${encodeURIComponent(partnerToken)}` : "";
    const response = await apiClient.get<FrontendResume>(
      `/api/resumes/embedded/${identifier}${qs}`,
      ResumeSchema as any,
    );
    return response.data;
  }

  /** Get a public resume by slug or UUID (no auth required). */
  async getPublicResume(slugOrId: string): Promise<FrontendResume> {
    const response = await apiClient.get<FrontendResume>(
      `/api/resumes/public/${slugOrId}`,
      ResumeSchema as any,
    );
    return response.data;
  }

  /**
   * Create a blank résumé — `POST /api/resumes { source: "blank" }`. The
   * server infers a title from the content when none is given.
   */
  async createResume(request: {
    title?: string;
    data?: ResumeData;
    rawText?: string;
    /** Pre-parsed JSON Resume content (canonical lowercase keys). When
     *  provided, the server skips AI parsing and stores this directly. */
    parsedContent?: Record<string, unknown>;
    privacy?: string;
    isMaster?: boolean;
    isActive?: boolean;
  }): Promise<Resume> {
    // Structured content takes priority: if the caller supplied
    // parsedContent OR data, use it as `content`. Only include rawText
    // when we have no structured content — belt-and-suspenders so the
    // server always prefers canonical structure over re-parsing.
    const hasStructured = !!request.parsedContent || !!request.data;
    const content: Record<string, unknown> =
      request.parsedContent ??
      ((request.data as unknown as Record<string, unknown>) ?? {});

    const response = await apiClient.request<Resume>(
      "/api/resumes",
      {
        method: "POST",
        body: JSON.stringify({
          source: "blank",
          ...(request.title ? { title: request.title } : {}),
          content,
          status: "draft",
          isMaster: request.isMaster ?? false,
          privacy: request.privacy ?? "private",
          ...(hasStructured ? {} : { rawText: request.rawText }),
        }),
        headers: {
          "Content-Type": "application/json",
        },
      },
      ResumeSchema,
    );
    trackJobSeekerStage("resume_created", { source: hasStructured ? "structured" : "text" });
    return response.data;
  }

  /**
   * Create a new resume from an uploaded file (PDF/DOCX/text/JSON/image).
   *
   * Single robust entry point for the "upload to create" flow: JSON Resume
   * exports persist their structure verbatim; everything else (including phone
   * photos / scans) goes through {@link parseResumeFromFile}, which uses
   * client-side extraction when it works and falls back to server-side
   * extraction / vision OCR when it doesn't. The parsed structured content is
   * then persisted via {@link createResume} — so a failed/garbage extraction
   * surfaces as a thrown error (clear message) instead of an empty resume.
   */
  async createResumeFromFile(
    file: File,
    opts: { title: string; privacy?: string; isMaster?: boolean },
  ): Promise<Resume> {
    // JSON Resume export — preserve dates/highlights exactly, skip the AI roundtrip.
    const jsonResume = await parseJsonResumeFile(file);
    if (jsonResume) {
      return this.createResume({
        title: opts.title,
        parsedContent: jsonResume,
        privacy: opts.privacy,
        isMaster: opts.isMaster,
      });
    }

    const { data } = await this.parseResumeFromFile(file);
    return this.createResume({
      title: opts.title,
      parsedContent: data as unknown as Record<string, unknown>,
      privacy: opts.privacy,
      isMaster: opts.isMaster,
    });
  }

  /**
   * Build the `/api/resumes/parse` request for a file. The transport choice
   * (structured JSON / client text / raw file or rasterised scan pages) is the
   * shared `resolveResumeUploadPayload`, so parse and merge-from-file upload
   * identically.
   */
  private async buildParseRequest(
    file: File,
  ): Promise<{ method: "POST"; body: FormData | string; headers?: Record<string, string>; timeout?: number }> {
    const payload = await resolveResumeUploadPayload(file);
    if (payload.kind === "files") {
      // Bounds the upload + response headers only; the parse itself streams
      // under an idle deadline (resume-parse-stream.ts).
      return { method: "POST", body: resumeFilesFormData(payload.files), timeout: 120_000 };
    }
    const body = payload.kind === "structured" ? { parsedContent: payload.content } : { content: payload.text };
    return { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } };
  }

  /**
   * Parse a résumé file without saving it. Streams progress (stage, OCR page,
   * provisional previews) to `onProgress`; there is no total deadline, only
   * an idle one, so a slow multi-page parse completes instead of timing out.
   */
  async parseResumeFromFile(
    file: File,
    onProgress?: (progress: ResumeParseProgress) => void,
  ): Promise<{ data: ResumeData; confidence: number }> {
    const init = await this.buildParseRequest(file);
    const parsed = await streamResumeParse(init, onProgress);
    return { data: toParsedResumeData(parsed), confidence: 0.8 };
  }

  /**
   * Update resume with new data structure. Slug lives in the body
   * alongside title/content/privacy/isMaster.
   */
  async updateResumeData(
    id: string,
    updates: {
      title?: string;
      data?: ResumeData;
      privacy?: ResumePrivacy;
      isMaster?: boolean;
      slug?: string | null;
    },
  ): Promise<FrontendResume> {
    const payload: Record<string, unknown> = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.data !== undefined) payload.content = updates.data;
    if (updates.isMaster !== undefined) payload.isMaster = updates.isMaster;
    if (updates.privacy !== undefined) payload.privacy = updates.privacy;
    if (updates.slug !== undefined) payload.slug = updates.slug;

    const response = await apiClient.put<FrontendResume>(
      `/api/resumes/${id}`,
      payload,
      ResumeSchema as any,
    );
    return response.data;
  }

  /**
   * Update only the metadata for a resume
   */
  async updateResumeMetadata(
    id: string,
    metadata: ResumeSectionMeta[],
  ): Promise<FrontendResume> {
    const response = await apiClient.put<FrontendResume>(
      `/api/resumes/${id}/metadata`,
      metadata,
      ResumeSchema as any,
    );
    return response.data;
  }

  /**
   * Validate slug for current user; optionally pass current resumeId to allow existing slug
   */
  async validateSlug(slug: string, resumeId?: string): Promise<{ slug: string; available: boolean }> {
    const qs = new URLSearchParams({ slug });
    if (resumeId) qs.set("resumeId", resumeId);
    const response = await apiClient.get<{ slug: string; available: boolean }>(
      `/api/resumes/validateslug?${qs.toString()}`,
      z.object({ slug: z.string(), available: z.boolean() }),
    );
    return response.data;
  }

  /**
   * Delete resume
   */
  async deleteResume(id: string): Promise<void> {
    await apiClient.delete(`/api/resumes/${id}`);
  }

  /** #155 — List version history snapshots (autosave + manual). */
  async listVersions(id: string): Promise<Array<{
    id: string;
    versionNumber: number;
    label: string | null;
    isAutosave: boolean;
    createdAt: string;
  }>> {
    const response = await apiClient.get<{ versions: Array<{
      id: string;
      versionNumber: number;
      label: string | null;
      isAutosave: boolean;
      createdAt: string;
    }> }>(`/api/resumes/${id}/versions`);
    return response.data.versions;
  }

  /** #155 — Manual snapshot of the current content. */
  async createVersion(
    id: string,
    opts: { label?: string; isAutosave?: boolean } = {},
  ): Promise<void> {
    await apiClient.post(`/api/resumes/${id}/versions`, opts);
  }

  /** #155 — Restore a prior version into the live resume content. */
  async restoreVersion(id: string, versionId: string): Promise<void> {
    await apiClient.post(`/api/resumes/${id}/versions/${versionId}/restore`, {});
  }

  /** Clone a résumé — `POST /api/resumes { source: "clone" }`. */
  async cloneResume(id: string): Promise<Resume> {
    const response = await apiClient.post<Resume>(
      "/api/resumes",
      { source: "clone", sourceId: id },
      ResumeSchema,
    );
    return response.data;
  }

  /**
   * Export resume (PDF, DOCX, etc.)
   */
  async exportResume(id: string, format = "pdf"): Promise<Blob> {
    const response = await apiClient.request<Blob>(
      `/api/resumes/${id}/export?format=${format}`,
      { method: "GET" },
    );

    // Return the blob directly for download
    return response.data;
  }

  /** Create a variation of a master résumé — `POST /api/resumes { source: "variation" }`. */
  async createResumeVariation(parentId: string, title: string): Promise<Resume> {
    try {
      const response = await apiClient.post<Resume>(
        "/api/resumes",
        { source: "variation", sourceId: parentId, title },
        ResumeSchema,
      );
      return response.data;
    } catch (error) {
      console.error("Error creating resume variation:", error);
      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to create resume variation. Please try again."
      );
    }
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const resumeService = new ResumeService();
export default resumeService;
