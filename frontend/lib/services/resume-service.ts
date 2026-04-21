/**
 * Resume Service
 * Handles resume-related API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { nullableString, nullableNumber, nullableBoolean } from "@shared/api";
import { ResumeSchema } from "@shared/resume";
import type { ResumeData, ResumePrivacy, Resume as FrontendResume, ResumeSectionMeta, MergeAnalysis, MergeRequest, MergeResult, FileMergeAnalysis, MergePreview, ResumeToResumeAnalysis, ConsolidateBulletsRequest, ConsolidateBulletsResult } from "@/types/resume";
import { mapDisplayPrivacyToResumePrivacy } from "@/lib/privacy";
import { extractTextFromFile, parseJsonResumeFile } from "@/lib/extract-text";

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
  async getPublicResumes(page = 1, limit = 20): Promise<PaginatedResumes> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

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

  /** Get resume for embedding (server bypasses privacy checks for this endpoint). */
  async getResumeForEmbed(identifier: string): Promise<FrontendResume> {
    const response = await apiClient.get<FrontendResume>(
      `/api/resumes/embedded/${identifier}`,
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
    return response.data as unknown as Resume;
  }

  /**
   * Parse resume from file upload (without saving)
   */
  async parseResumeFromFile(file: File): Promise<{
    data: ResumeData;
    confidence: number;
  }> {
    // Prefer structured JSON Resume parsing when possible. Falls back to
    // client-side text extraction (pdfjs-dist / jszip) for PDF/DOCX so
    // the CF Worker receives plain text instead of binary it can't parse.
    const jsonResume = await parseJsonResumeFile(file);
    const payload: Record<string, unknown> = jsonResume
      ? { parsedContent: jsonResume }
      : { content: await extractTextFromFile(file) };

    const response = await apiClient.request<{
      result: string;
      errorMessage?: string;
    }>(
      "/api/resumes/parse",
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      },
      z.object({
        result: z.string(),
        errorMessage: z.string().optional(),
      }),
    );

    if (response.data.errorMessage) {
      throw new Error(response.data.errorMessage);
    }

    try {
      // Parse the JSON result from the AI parsing
      const parsedData = JSON.parse(response.data.result);

      // Support both camelCase (AI output) and PascalCase (legacy MetaResume format)
      const basics = parsedData.basics ?? parsedData.basics ?? {};
      const location = basics.location ?? basics.Location ?? null;
      const work = parsedData.work ?? parsedData.work ?? [];
      const education = parsedData.education ?? parsedData.education ?? [];
      const skills = parsedData.skills ?? parsedData.skills ?? [];
      const volunteer = parsedData.volunteer ?? parsedData.volunteer ?? [];
      const awards = parsedData.awards ?? parsedData.awards ?? [];
      const certificates = parsedData.certificates ?? parsedData.certificates ?? [];
      const publications = parsedData.publications ?? parsedData.publications ?? [];
      const languages = parsedData.languages ?? parsedData.languages ?? [];
      const interests = parsedData.interests ?? parsedData.interests ?? [];
      const references = parsedData.references ?? parsedData.references ?? [];
      const projects = parsedData.projects ?? parsedData.projects ?? [];

      // Convert to ResumeData format
      const resumeData: ResumeData = {
  basics: {
          name: basics.name ?? basics.name ?? "",
          label: basics.label ?? basics.label ?? "",
          image: basics.image ?? basics.image ?? "",
          email: basics.email ?? basics.email ?? "",
          phone: basics.phone ?? basics.phone ?? "",
          url: basics.url ?? basics.url ?? "",
          summary: basics.summary ?? basics.summary ?? "",
          location: location
            ? {
              address: location.address ?? location.address ?? "",
              postalCode: location.postalCode ?? location.postalCode ?? "",
              city: location.city ?? location.city ?? "",
              countryCode: location.countryCode ?? location.countryCode ?? "",
              region: location.region ?? location.region ?? "",
            }
            : null,
        },
        work: Array.isArray(work)
          ? work.map((w: any) => ({
            name: w?.name ?? w?.Name ?? w?.company ?? w?.Company ?? "",
            position: w?.position ?? w?.Position ?? "",
            summary: w?.summary ?? w?.Summary ?? "",
            startDate: w?.startDate ?? w?.StartDate ?? "",
            endDate: w?.endDate ?? w?.EndDate ?? "",
            highlights: Array.isArray(w?.highlights ?? w?.Highlights) ? (w?.highlights ?? w?.Highlights) : [],
            url: w?.url ?? w?.Url ?? "",
          }))
          : [],
        education: Array.isArray(education)
          ? education.map((e: any) => ({
            institution: e?.institution ?? e?.Institution ?? "",
            area: e?.area ?? e?.Area ?? "",
            studyType: e?.studyType ?? e?.StudyType ?? "",
            startDate: e?.startDate ?? e?.StartDate ?? "",
            endDate: e?.endDate ?? e?.EndDate ?? "",
            score: e?.score ?? e?.Score ?? "",
            courses: Array.isArray(e?.courses ?? e?.Courses) ? (e?.courses ?? e?.Courses) : null,
            url: e?.url ?? e?.Url ?? "",
          }))
          : [],
        skills: Array.isArray(skills)
          ? skills.map((s: any) => ({
            name: s?.name ?? s?.Name ?? "",
            level: s?.level ?? s?.Level ?? "",
            keywords: Array.isArray(s?.keywords ?? s?.Keywords) ? (s?.keywords ?? s?.Keywords) : [],
          }))
          : [],
        volunteer: Array.isArray(volunteer)
          ? volunteer.map((v: any) => ({
            organization: v?.organization ?? v?.Organization ?? "",
            position: v?.position ?? v?.Position ?? "",
            summary: v?.summary ?? v?.Summary ?? "",
            startDate: v?.startDate ?? v?.StartDate ?? "",
            endDate: v?.endDate ?? v?.EndDate ?? "",
            highlights: Array.isArray(v?.highlights ?? v?.Highlights) ? (v?.highlights ?? v?.Highlights) : null,
            url: v?.url ?? v?.Url ?? "",
          }))
          : [],
        awards: Array.isArray(awards)
          ? awards.map((a: any) => ({
            title: a?.title ?? a?.Title ?? "",
            date: a?.date ?? a?.Date ?? "",
            awarder: a?.awarder ?? a?.Awarder ?? "",
            summary: a?.summary ?? a?.Summary ?? "",
          }))
          : [],
        certificates: Array.isArray(certificates)
          ? certificates.map((cert: any) => ({
            name: cert?.name ?? cert?.Name ?? "",
            date: cert?.date ?? cert?.Date ?? "",
            issuer: cert?.issuer ?? cert?.Issuer ?? "",
            url: cert?.url ?? cert?.Url ?? "",
          }))
          : [],
        publications: Array.isArray(publications)
          ? publications.map((p: any) => ({
            name: p?.name ?? p?.Name ?? "",
            publisher: p?.publisher ?? p?.Publisher ?? "",
            releaseDate: p?.releaseDate ?? p?.ReleaseDate ?? "",
            url: p?.url ?? p?.Url ?? "",
            summary: p?.summary ?? p?.Summary ?? "",
          }))
          : [],
        languages: Array.isArray(languages) ? languages : [],
        interests: Array.isArray(interests) ? interests : [],
        references: Array.isArray(references) ? references : [],
        projects: Array.isArray(projects) ? projects : [],
        meta: undefined,
      };

      return {
        data: resumeData,
        confidence: 0.8, // Default confidence score
      };
    } catch (parseError) {
      console.warn("Resume parse failed, returning empty data:", parseError);
      const emptyData: ResumeData = {
        basics: { name: "", label: "", image: "", email: "", phone: "", url: "", summary: "", location: null },
        work: [], volunteer: [], education: [], awards: [], certificates: [],
        publications: [], skills: [], languages: [], interests: [], references: [], projects: [], metaData: [],
      };
      return { data: emptyData, confidence: 0 };
    }
  }

  /**
   * Create resume from file upload (saves immediately)
   */
  async createResumeFromFile(file: File): Promise<Resume> {
    const formData = new FormData();
    formData.append("file", file);

    // Note: This will need special handling for FormData
    const response = await apiClient.request<Resume>(
      "/api/resumes/createfromfile",
      {
        method: "POST",
        body: formData,
        headers: {}, // Remove Content-Type to let browser set it for FormData
      },
      ResumeSchema,
    );

    return response.data;
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
   * alongside title/content/privacy/isMaster — the shared
   * UpdateResumeSchema validates it (rejects UUID-shaped values at parse
   * time, which was the 2026-04-19 "Slug must not look like a UUID" bug).
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

  /**
   * Get resume sentiment analysis
   */
  async getResumeSentiment(
    id: string,
  ): Promise<{ sentiment: string; score: number }> {
    const response = await apiClient.post<{ sentiment: string; score: number }>(
      `/api/resumes/sentimentprediction`,
      { resumeId: id },
      z.object({
        sentiment: z.string(),
        score: z.number(),
      }),
    );

    return response.data;
  }

  /**
   * Parse resume from text/file
   */
  async parseResume(content: string): Promise<Partial<CreateResume>> {
    const response = await apiClient.post<Partial<CreateResume>>(
      `/api/resumes/parse`,
      { content },
      CreateResumeSchema.partial(),
    );

    return response.data;
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
  async getResumesForDisplay(): Promise<ResumeWithOwnership[]> {
    const [owned, groups] = await Promise.all([
      this.getResumesWithOwnership().catch(() => []),
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
      viewCount: r.viewCount,
      isOwner: r.isOwner,
      isWatched: r.isWatched,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      headline: (r.content.basics?.label as string | undefined) ?? "",
      summary: (r.content.basics?.summary as string | undefined) ?? "",
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
  async getResumesWithOwnership(): Promise<ResumeWithOwnership[]> {
    try {
      const response = await apiClient.get<ResumeWithOwnership[]>(
        `/api/resumes/withownership`,
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

  async analyzeMerge(sourceResumeId: string, targetResumeId: string, useAI = true): Promise<ResumeToResumeAnalysis> {
    // AI-backed analyze can exceed the 30s default on large resumes.
    const response = await apiClient.request<ResumeToResumeAnalysis>(
      `/api/resumes/merge/analyze`,
      { method: "POST", body: { sourceResumeId, targetResumeId, useAI }, timeout: 120_000 },
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
   * executeMerge; `createNew`/`newTitle` are ignored by the server.
   */
  async previewMerge(request: MergeRequest): Promise<MergePreview> {
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

  async analyzeFileMerge(file: File, targetResumeId: string, useAI = true): Promise<FileMergeAnalysis> {
    // Prefer structured JSON Resume parsing over text extraction. When the
    // user uploads a .json export (either PascalCase hired.video format
    // or canonical jsonresume.org), we send the already-parsed content
    // directly — skips the lossy text->AI roundtrip and preserves dates,
    // highlights arrays, etc. exactly as authored.
    const jsonResume = await parseJsonResumeFile(file);
    const body = jsonResume
      ? { parsedContent: jsonResume, targetResumeId, useAI }
      : { text: await extractTextFromFile(file), targetResumeId, useAI };

    // Back-to-back AI calls (parse + analyze) on a multi-page resume can
    // comfortably exceed the 30s default. Bump to 120s so the client
    // doesn't abort a request the backend is still legitimately working on.
    const response = await apiClient.request<FileMergeAnalysis>(
      `/api/resumes/merge/from-file`,
      { method: "POST", body, timeout: 120_000 },
      z.any(),
    );
    return response.data;
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const resumeService = new ResumeService();
export default resumeService;
