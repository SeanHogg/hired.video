/**
 * Resume Service
 * Handles resume-related API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { trackJobSeekerStage } from "@/lib/analytics/jobseeker-funnel";
import { nullableString, nullableNumber, nullableBoolean } from "@shared/api";
import { ResumeContentSchema, ResumeSchema } from "@shared/resume";
import { readCoverLetter } from "@shared/cover-letter";
import type { ReviseFocus } from "@shared/video-plan";
import { CARD_FIELDS_BY_KIND, serializeListFields } from "@shared/projection";
import { streamResumeParse, type ResumeParseProgress } from "./resume-parse-stream";
import { toParsedResumeData } from "./resume-parse-result";
import type { ResumeData, ResumePrivacy, Resume as FrontendResume, ResumeSectionMeta, MergeAnalysis, MergeRequest, MergePreviewRequest, MergeResult, FileMergeAnalysis, MergePreview, ResumeToResumeAnalysis, ConsolidateBulletsRequest, ConsolidateBulletsResult } from "@/types/resume";
import { mapDisplayPrivacyToResumePrivacy } from "@/lib/privacy";
import { parseJsonResumeFile } from "@/lib/extract-text";
import { resolveResumeUploadPayload, resumeFilesFormData } from "./resume-upload-payload";

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

// Loose ResumeSummarySchema for the list endpoints that accept mixed
// PascalCase/camelCase payloads. The canonical schema lives in
// @shared/resume; this one is the normalization target for legacy
// responses.
export const ResumeSummarySchema = z
  .object({
    id: nullableString(),
    userId: nullableString(),
    title: z.string().optional().nullable(),
    slug: nullableString(),
    summary: z.string().optional().nullable(),
    headline: z.string().optional().nullable(),
    description: nullableString(),
    privacy: z.string().optional().nullable(),
    isMaster: nullableBoolean(),
    isActive: nullableBoolean(),
    isOwner: nullableBoolean(),
    isWatched: nullableBoolean(),
    hasCoverLetter: nullableBoolean(),
    parentId: nullableString(),
    diffPercent: nullableNumber(),
    sentimentScore: nullableNumber(),
    viewCount: nullableNumber(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export const CreateResumeSchema = z.object({
  title: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
  linkedIn: z.string().optional(),
  github: z.string().optional(),
  summary: z.string().optional(),
  experience: z
    .array(
      z.object({
        company: z.string(),
        position: z.string(),
        startDate: z.string(),
        endDate: z.string().optional(),
        description: z.string().optional(),
        current: z.boolean().optional(),
      }),
    )
    .optional(),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string(),
        field: z.string().optional(),
        startDate: z.string(),
        endDate: z.string().optional(),
        gpa: z.string().optional(),
      }),
    )
    .optional(),
  skills: z.array(z.string()).optional(),
  certifications: z
    .array(
      z.object({
        name: z.string(),
        issuer: z.string(),
        date: z.string(),
        expiryDate: z.string().optional(),
      }),
    )
    .optional(),
  projects: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        technologies: z.array(z.string()).optional(),
        url: z.string().optional(),
      }),
    )
    .optional(),
  isPublic: z.boolean().optional(),
  templateId: z.string().optional(),
});

// Accept both our normalized keys and backend PascalCase keys
export const PaginatedResumesSchema = z.object({
  items: z.array(ResumeSummarySchema).nullable().optional(),
  Items: z.array(ResumeSummarySchema).nullable().optional(),
  total: z.number().nullable().optional(),
  Total: z.number().nullable().optional(),
  page: z.number().nullable().optional(),
  Page: z.number().nullable().optional(),
  limit: z.number().nullable().optional(),
  Limit: z.number().nullable().optional(),
  hasNext: z.boolean().nullable().optional(),
  hasPrev: z.boolean().nullable().optional(),
  hasNextPage: z.boolean().nullable().optional(),
  HasNextPage: z.boolean().nullable().optional(),
  hasPreviousPage: z.boolean().nullable().optional(),
  HasPreviousPage: z.boolean().nullable().optional(),
});

// Master Resume System Schemas
// Single source of truth lives in shared/resume.ts — no local duplicate.
// If a field changes shape on the backend, update ResumeWithOwnershipSchema
// over there and both sides recompile. Tests in resume-contract.test.ts
// enforce that the backend's rowToResumeSummary output parses this shape.
import { ResumeWithOwnershipSchema } from "@shared/resume";

const MasterResumeGroupSchema = z.object({
  masterResume: ResumeSchema,
  variations: z.array(ResumeSchema),
});

// ============================================================================
// TYPES
// ============================================================================

export type Resume = z.infer<typeof ResumeSchema>;
export type ResumeSummary = z.infer<typeof ResumeSummarySchema>;
export type CreateResume = z.infer<typeof CreateResumeSchema>;
export type PaginatedResumes = z.infer<typeof PaginatedResumesSchema>;
export type ResumeWithOwnership = z.infer<typeof ResumeWithOwnershipSchema>;
export type MasterResumeGroup = z.infer<typeof MasterResumeGroupSchema>;

// ============================================================================
// RESUME SERVICE CLASS
// ============================================================================

export class ResumeService {
  /**
   * Get all public resumes
   */
  async getPublicResumes(
    page = 1,
    limit = 20,
    options: { fields?: readonly string[] } = {},
  ): Promise<PaginatedResumes> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    // `?fields=` projection (gap #1444) — resume `content` JSONB is the
    // heavy column; list view never needs it. Default to the card subset;
    // callers asking for the full row pass `fields: []`.
    const fields = serializeListFields(
      "resumes",
      options.fields ?? CARD_FIELDS_BY_KIND.resumes,
    );
    if (fields) params.set("fields", fields);

    const response = await apiClient.get<any>(
      `/api/resumes/public?${params.toString()}`,
      PaginatedResumesSchema,
    );

    const dto = response.data;
    const rawItems = (dto.items || dto.Items || []) as unknown[];
    const total = (dto.total ??
      dto.Total ??
      (Array.isArray(rawItems) ? rawItems.length : 0)) as number;
    const pageNum = (dto.page ?? dto.Page ?? 1) as number;
    const limitNum = (dto.limit ??
      dto.Limit ??
      (Array.isArray(rawItems) ? rawItems.length : 0)) as number;
    const hasNext = (dto.hasNext ??
      dto.hasNextPage ??
      dto.HasNextPage ??
      pageNum * limitNum < total) as boolean;
    const hasPrev = (dto.hasPrev ??
      dto.hasPreviousPage ??
      dto.HasPreviousPage ??
      pageNum > 1) as boolean;

    // Normalize the resume items to have consistent property names
    const items = rawItems.map((item: any) => ({
      id: item.id,
      templateName: item.TemplateName || item.templateName,
      isPublic: item.IsPublic ?? item.isPublic,
      isOwner: item.IsOwner ?? item.isOwner,
      creationDateTimeFormatted:
        item.CreationDateTimeFormatted || item.creationDateTimeFormatted,
      sentimentScore: item.SentimentScore ?? item.sentimentScore,
      userId: item.UserId || item.userId,
      title: item.title,
      slug: item.Slug || item.slug,
      description: item.description,
      isPrimaryDefault: item.IsPrimaryDefault ?? item.isPrimaryDefault,
      isWatched: item.IsWatched ?? item.isWatched,
      latitude: item.Latitude ?? item.latitude,
      longitude: item.Longitude ?? item.longitude,
      location: item.Location || item.location,
      privacy: item.Privacy ?? item.privacy,
      isMaster: item.IsMaster ?? item.isMaster,
      isActive: item.IsActive ?? item.isActive,
      parentId: item.ParentId ?? item.parentId ?? null,
      summary: item.description || item.summary,
      createdAt:
        item.CreationDateTimeFormatted ||
        item.creationDateTimeFormatted ||
        item.createdAt,
      updatedAt:
        item.UpdatedAt ||
        item.updatedAt ||
        item.CreationDateTimeFormatted ||
        item.creationDateTimeFormatted,
    })) as ResumeSummary[];

    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      hasNext,
      hasPrev,
    };
  }



  /**
   * Get resumes owned by current user
   */
  async getUserResumes(): Promise<ResumeSummary[]> {
    const response = await apiClient.get<ResumeSummary[]>(
      "/api/resumes/getresumesownedbyauthuser",
      z.array(ResumeSummarySchema),
    );

    return response.data;
  }

  /**
   * Get resumes for a specific user. The backend returns the public list
   * (privacyLevel=0) for non-owners and the full list for the owner.
   */
  async getResumesByUserId(userId: string): Promise<ResumeSummary[]> {
    const response = await apiClient.get<ResumeSummary[]>(
      `/api/users/${userId}/resumes`,
      z.array(ResumeSummarySchema),
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
   * Create new resume from CreateResumeRequest
   */
  async createResume(request: {
    title: string;
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

    const response = await apiClient.request<FrontendResume>(
      "/api/resumes/",
      {
        method: "POST",
        body: JSON.stringify({
          title: request.title,
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
      ResumeSchema as any,
    );
    trackJobSeekerStage("resume_created", { source: hasStructured ? "structured" : "text" });
    return response.data as unknown as Resume;
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
   * Parse resume from file upload (without saving)
   */
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
   * The kit chat: a change request comes back as revised `content` plus
   * the areas it `changed`; a question comes back as a `reply` and leaves the
   * draft alone. Nothing is persisted server-side. Anonymous-capable
   * (IP-capped), like parse.
   */
  async reviseResumeContent(
    content: ResumeData,
    instruction: string,
    focus?: ReviseFocus,
  ): Promise<{ content: ResumeData; changed: string[] } | { reply: string }> {
    const response = await apiClient.request<{ content: ResumeData; changed: string[] } | { reply: string }>(
      "/api/resumes/revise",
      {
        method: "POST",
        body: JSON.stringify({ content, instruction, focus }),
        headers: { "Content-Type": "application/json" },
        // A full-resume rewrite can exceed the 30s default on the fallback model.
        timeout: 90_000,
      },
      z.union([
        z.object({ reply: z.string() }),
        z.object({ content: ResumeContentSchema, changed: z.array(z.string()).default([]) }),
      ]),
    );
    return response.data;
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
   * Update existing resume
   */
  async updateResume(
    id: string,
    updates: Partial<CreateResume>,
  ): Promise<Resume> {
    const response = await apiClient.put<Resume>(
      `/api/resumes/${id}`,
      updates,
      ResumeSchema,
    );
    return response.data;
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

  /** #154 — Archive (soft-delete). Hides from default list, preserves analytics. */
  async archiveResume(id: string): Promise<void> {
    await apiClient.post(`/api/resumes/${id}/archive`, {});
  }

  /** #154 — Unarchive. Restores into the default list. */
  async unarchiveResume(id: string): Promise<void> {
    await apiClient.post(`/api/resumes/${id}/unarchive`, {});
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

  /**
   * Clone resume
   */
  async cloneResume(id: string): Promise<Resume> {
    const response = await apiClient.post<Resume>(
      `/api/resumes/${id}/clone`,
      {},
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

  /**
   * Watch/track resume
   */
  async watchResume(id: string): Promise<void> {
    await apiClient.post(`/api/resumes/watch/${id}`);
  }

  /**
   * Unwatch/untrack resume
   */
  async unwatchResume(id: string): Promise<void> {
    await apiClient.post(`/api/resumes/unwatch/${id}`);
  }
  /**
   * Get AI-generated resume summary
   */
  async getResumeSummary(id: string): Promise<string> {
    const response = await apiClient.post<{ summary: string }>(
      `/api/resumes/summarize`,
      { resumeId: id },
      z.object({ summary: z.string() }),
    );

    return response.data.summary;
  }

  // Master Resume System Methods

  /**
   * Set a resume as the master resume
   */
  async setMasterResume(id: string): Promise<boolean> {
    try {
      const response = await apiClient.post<boolean>(
        `/api/resumes/${id}/setmaster`,
        {},
        z.boolean(),
      );
      return response.data;
    } catch (error) {
      console.error("Error setting master resume:", error);
      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to set master resume. Please try again."
      );
    }
  }

  /**
   * Set a resume as the active resume
   */
  async setActiveResume(id: string): Promise<boolean> {
    try {
      const response = await apiClient.post<boolean>(
        `/api/resumes/${id}/setactive`,
        {},
        z.boolean(),
      );
      return response.data;
    } catch (error) {
      console.error("Error setting active resume:", error);
      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to set active resume. Please try again."
      );
    }
  }

  /**
   * Set resume privacy with backend-enforced exclusivity rules
   */
  async setResumePrivacy(id: string, privacy: ResumePrivacy): Promise<boolean> {
    const response = await apiClient.post<boolean>(
      `/api/resumes/${id}/setprivacy`,
      { privacy },
      z.boolean()
    );
    return response.data === true;
  }

  /** Promote a variant to be the new master resume */
  /**
   * Detach a variant from its parent so it becomes a standalone resume.
   * Used when the user asks to create a variation from a resume that is
   * itself already a variant — the one-level hierarchy means we must root
   * it first. Unlike `promoteVariantToMaster`, this does NOT touch the
   * singleton `isMaster` flag.
   */
  async detachFromParent(id: string): Promise<boolean> {
    try {
      const response = await apiClient.post<boolean>(
        `/api/resumes/${id}/detach`,
        {},
        z.boolean(),
      );
      return response.data;
    } catch (error) {
      console.error("Error detaching resume from parent:", error);
      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to detach resume from parent. Please try again."
      );
    }
  }

  async promoteVariantToMaster(id: string): Promise<boolean> {
    try {
      const response = await apiClient.post<boolean>(
        `/api/resumes/${id}/promote`,
        {},
        z.boolean(),
      );
      return response.data;
    } catch (error) {
      console.error("Error promoting variant to master:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to promote variant to master. Please try again."
      );
    }
  }

  /**
   * Create a variation of a master resume
   */
  async createResumeVariation(parentId: string, title: string): Promise<Resume> {
    try {
      const response = await apiClient.post<Resume>(
        `/api/resumes/${parentId}/createvariation`,
        { title },
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

  /**
   * Get master resume groups for the current user
   */
  async getMasterResumeGroups(): Promise<MasterResumeGroup[]> {
    try {
      const response = await apiClient.get<MasterResumeGroup[]>(
        `/api/resumes/mastergroups`,
        z.array(MasterResumeGroupSchema),
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching master resume groups:", error);
      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to load resume collections. Please try again."
      );
    }
  }

  /**
   * Consolidated fetch for the /resumes page
   * - Returns normalized ResumeWithOwnership[]
   * - If withOwnership is empty, falls back to master groups (masters + variations)
   */
  async getResumesForDisplay(opts: { includeArchived?: boolean } = {}): Promise<ResumeWithOwnership[]> {
    const [owned, groups] = await Promise.all([
      this.getResumesWithOwnership(opts).catch(() => []),
      this.getMasterResumeGroups().catch(() => []),
    ]);

    if (owned.length > 0) return owned;

    // Fallback: flatten master groups into ResumeWithOwnership entries.
    // Field names match the canonical ResumeSummary in shared/resume.ts —
    // if this mapping ever diverges from the backend serializer again
    // (resume-contract.test.ts guards this in CI), cards will render blank.
    const items: ResumeWithOwnership[] = [];
    const toOwnership = (r: FrontendResume): ResumeWithOwnership => ({
      id: r.id,
      userId: r.userId,
      title: r.title,
      slug: r.slug ?? null,
      status: r.status,
      privacy: r.privacy as ResumePrivacy,
      isMaster: r.isMaster,
      isActive: r.isActive,
      parentId: r.parentId ?? null,
      diffPercent: r.diffPercent ?? null,
      templateId: r.templateId ?? null,
      metaResumeId: r.metaResumeId ?? null,
      sentimentScore: r.sentimentScore ?? null,
      scores: (r as any).scores ?? null,
      viewCount: r.viewCount,
      isOwner: r.isOwner,
      isWatched: r.isWatched,
      archivedAt: (r as any).archivedAt ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      headline: (r.content.basics?.label as string | undefined) ?? "",
      summary: (r.content.basics?.summary as string | undefined) ?? "",
      hasCoverLetter: readCoverLetter(r.content) !== null,
      ownership: "owned",
    });

    for (const group of groups) {
      if (group.masterResume) items.push(toOwnership(group.masterResume));
      for (const v of group.variations) items.push(toOwnership(v));
    }

    return items;
  }


  /**
   * Get resumes with ownership information
   */
  async getResumesWithOwnership(opts: { includeArchived?: boolean } = {}): Promise<ResumeWithOwnership[]> {
    try {
      const qs = opts.includeArchived ? "?includeArchived=1" : "";
      const response = await apiClient.get<ResumeWithOwnership[]>(
        `/api/resumes/withownership${qs}`,
        z.array(ResumeWithOwnershipSchema),
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching resumes with ownership:", error);
      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to load resumes. Please try again."
      );
    }
  }

  // ==========================================================================
  // MERGE
  // ==========================================================================

  /** `target` is a stored résumé id, or `{ content }` — what is on screen
   *  (the kit pulls the master into a version it has open). */
  async analyzeMerge(sourceResumeId: string, target: MergeTarget, useAI = true): Promise<ResumeToResumeAnalysis> {
    // AI-backed analyze can exceed the 30s default on large resumes.
    const response = await apiClient.request<ResumeToResumeAnalysis>(
      `/api/resumes/merge/analyze`,
      { method: "POST", body: { sourceResumeId, ...mergeTargetBody(target), useAI }, timeout: 120_000 },
      z.any(),
    );
    return response.data;
  }

  async executeMerge(request: MergeRequest): Promise<MergeResult> {
    const response = await apiClient.post<MergeResult>(
      `/api/resumes/merge/execute`,
      request,
      z.any(),
    );
    return response.data;
  }

  /**
   * Run the merge without saving — returns the merged content so the UI
   * can render a preview before the user commits. Same inputs as
   * executeMerge minus the save-only fields.
   */
  async previewMerge(request: MergePreviewRequest): Promise<MergePreview> {
    const response = await apiClient.post<MergePreview>(
      `/api/resumes/merge/preview`,
      request,
      z.any(),
    );
    return response.data;
  }

  /**
   * Ask the AI to consolidate/rewrite a flat bullet list — dedupes slight
   * wording variants, normalises keyword casing, tightens phrasing. Never
   * invents facts. Caller is responsible for showing a diff and having
   * the user accept before replacing the original list.
   */
  async consolidateBullets(request: ConsolidateBulletsRequest): Promise<ConsolidateBulletsResult> {
    const response = await apiClient.post<ConsolidateBulletsResult>(
      `/api/resumes/ai/consolidate-bullets`,
      request,
      z.any(),
    );
    return response.data;
  }

  /** Analyse content that is already parsed (no AI parse step) against a
   *  target — the kit workspace re-runs a merge it reviewed against the master. */
  async analyzeParsedMerge(parsedContent: Record<string, unknown>, target: MergeTarget, useAI = true): Promise<FileMergeAnalysis> {
    const response = await apiClient.request<FileMergeAnalysis>(
      `/api/resumes/merge/from-file`,
      { method: "POST", body: { parsedContent, ...mergeTargetBody(target), useAI }, timeout: 120_000 },
      z.any(),
    );
    return response.data;
  }

  async analyzeFileMerge(file: File, target: MergeTarget, useAI = true): Promise<FileMergeAnalysis> {
    // Same transport decision as parse: a JSON Resume export goes over as
    // structured `parsedContent` (dates/highlights exact, no AI roundtrip);
    // usable client-extracted text goes as `text`; images, scans and files the
    // browser can't read (pdfjs often fails on phones) upload raw as multipart
    // so the server runs its extractor / vision OCR (#2228).
    const payload = await resolveResumeUploadPayload(file);
    let body: FormData | Record<string, unknown>;
    if (payload.kind === "files") {
      const fd = resumeFilesFormData(payload.files);
      if (typeof target === "string") fd.append("targetResumeId", target);
      else fd.append("targetContent", JSON.stringify(target.content));
      fd.append("useAI", String(useAI));
      body = fd;
    } else {
      const source = payload.kind === "structured" ? { parsedContent: payload.content } : { text: payload.text };
      body = { ...source, ...mergeTargetBody(target), useAI };
    }

    // Back-to-back AI calls (extract/OCR + parse + analyze) on a multi-page
    // resume can comfortably exceed the 30s default. Bump to 120s so the
    // client doesn't abort a request the backend is still working on.
    const response = await apiClient.request<FileMergeAnalysis>(
      `/api/resumes/merge/from-file`,
      { method: "POST", body, timeout: 120_000 },
      z.any(),
    );
    return response.data;
  }
}

/** The résumé a merge goes into: a stored id, or content sent inline. */
export type MergeTarget = string | { content: Record<string, unknown> };

function mergeTargetBody(target: MergeTarget) {
  return typeof target === "string" ? { targetResumeId: target } : { targetContent: target.content };
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const resumeService = new ResumeService();
export default resumeService;
