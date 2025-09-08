/**
 * Resume Service
 * Handles resume-related API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import { nullableString, nullableNumber, nullableBoolean } from "@shared/api";

// ============================================================================
// SCHEMAS
// ============================================================================

// Schema for the actual ResumeInformationEntity structure returned by the API
export const ResumeSchema = z
  .object({
    id: nullableString(),
    userId: nullableString(),
    name: nullableString(),
    slug: nullableString(),
    description: nullableString(),
    isPrimaryDefault: nullableBoolean(),
    sentimentScore: nullableNumber(),
    isWatched: nullableBoolean(),
    privacy_ShowResume: nullableNumber(),
    privacy_ShowContactDetails: nullableNumber(),
    industry: nullableNumber(),
    employmentType: z
      .array(z.number())
      .nullable()
      .transform((val) => (val === null ? undefined : val))
      .optional(),
    paySchedule: nullableNumber(),
    minimumSalary: nullableNumber(),
    resumeType: nullableNumber(),
    resumeSerialized: nullableString(),
    createdAt: nullableString(),
    updatedAt: nullableString(),
    views: nullableNumber(),
    metaResume: z
      .object({
        id: nullableString(),
        basics: z
          .object({
            id: nullableString(),
            name: nullableString(),
            label: nullableString(),
            image: nullableString(),
            email: nullableString(),
            phone: nullableString(),
            url: nullableString(),
            summary: nullableString(),
            location: z
              .object({
                address: nullableString(),
                city: nullableString(),
                region: nullableString(),
                postalCode: nullableString(),
                countryCode: nullableString(),
              })
              .nullable()
              .optional(),
          })
          .nullable()
          .optional(),
        work: z
          .array(
            z.object({
              id: nullableString(),
              name: nullableString(),
              position: nullableString(),
              summary: nullableString(),
              startDate: nullableString(),
              endDate: nullableString(),
              highlights: z
                .array(z.string())
                .nullable()
                .transform((val) => (val === null ? undefined : val))
                .optional(),
              url: nullableString(),
            }),
          )
          .nullable()
          .transform((val) => (val === null ? undefined : val))
          .optional(),
        education: z
          .array(
            z.object({
              id: nullableString(),
              institution: nullableString(),
              area: nullableString(),
              studyType: nullableString(),
              startDate: nullableString(),
              endDate: nullableString(),
              score: nullableString(),
              courses: z
                .array(z.string())
                .nullable()
                .transform((val) => (val === null ? undefined : val))
                .optional(),
              url: nullableString(),
            }),
          )
          .nullable()
          .transform((val) => (val === null ? undefined : val))
          .optional(),
        volunteer: z
          .array(
            z.object({
              id: nullableString(),
              organization: nullableString(),
              position: nullableString(),
              summary: nullableString(),
              startDate: nullableString(),
              endDate: nullableString(),
              highlights: z
                .array(z.string())
                .nullable()
                .transform((val) => (val === null ? undefined : val))
                .optional(),
              url: nullableString(),
            }),
          )
          .nullable()
          .transform((val) => (val === null ? undefined : val))
          .optional(),
        skills: z
          .array(
            z.object({
              id: nullableString(),
              name: nullableString(),
              level: nullableString(),
              keywords: z
                .array(z.string())
                .nullable()
                .transform((val) => (val === null ? undefined : val))
                .optional(),
            }),
          )
          .nullable()
          .transform((val) => (val === null ? undefined : val))
          .optional(),
        // Add other sections as needed
      })
      .nullable()
      .optional(),
  })
  .passthrough();

export const ResumeSummarySchema = z.object({
  // Backend properties (PascalCase)
  Id: nullableString(),
  TemplateName: nullableString(),
  IsPublic: nullableBoolean(),
  IsOwner: nullableBoolean(),
  CreationDateTimeFormatted: nullableString(),
  SentimentScore: nullableNumber(),
  UserId: nullableString(),
  Name: nullableString(),
  Slug: nullableString(),
  Description: nullableString(),
  IsPrimaryDefault: nullableBoolean(),
  IsWatched: nullableBoolean(),
  Latitude: nullableNumber(),
  Longitude: nullableNumber(),
  Location: nullableString(),

  // Frontend properties (camelCase)
  id: nullableString(),
  templateName: nullableString(),
  isPublic: nullableBoolean(),
  isOwner: nullableBoolean(),
  creationDateTimeFormatted: nullableString(),
  sentimentScore: nullableNumber(),
  userId: nullableString(),
  name: nullableString(),
  slug: nullableString(),
  description: nullableString(),
  isPrimaryDefault: nullableBoolean(),
  isWatched: nullableBoolean(),
  latitude: nullableNumber(),
  longitude: nullableNumber(),
  location: nullableString(),

  // Legacy properties for backward compatibility
  title: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  summary: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

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

// ============================================================================
// TYPES
// ============================================================================

export type Resume = z.infer<typeof ResumeSchema>;
export type ResumeSummary = z.infer<typeof ResumeSummarySchema>;
export type CreateResume = z.infer<typeof CreateResumeSchema>;
export type PaginatedResumes = z.infer<typeof PaginatedResumesSchema>;

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
      `/api/Resume/public?${params.toString()}`,
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
      // Use backend properties if available, fallback to frontend properties
      id: item.Id || item.id,
      templateName: item.TemplateName || item.templateName,
      isPublic: item.IsPublic ?? item.isPublic,
      isOwner: item.IsOwner ?? item.isOwner,
      creationDateTimeFormatted:
        item.CreationDateTimeFormatted || item.creationDateTimeFormatted,
      sentimentScore: item.SentimentScore ?? item.sentimentScore,
      userId: item.UserId || item.userId,
      name: item.Name || item.name,
      slug: item.Slug || item.slug,
      description: item.Description || item.description,
      isPrimaryDefault: item.IsPrimaryDefault ?? item.isPrimaryDefault,
      isWatched: item.IsWatched ?? item.isWatched,
      latitude: item.Latitude ?? item.latitude,
      longitude: item.Longitude ?? item.longitude,
      location: item.Location || item.location,

      // Computed properties for backward compatibility
      title: item.Name || item.name || item.title,
      summary: item.Description || item.description || item.summary,
      createdAt:
        item.CreationDateTimeFormatted ||
        item.creationDateTimeFormatted ||
        item.createdAt,
      updatedAt:
        item.CreationDateTimeFormatted ||
        item.creationDateTimeFormatted ||
        item.updatedAt,
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
      "/api/Resume/GetResumesOwnedbyAuthUser",
      z.array(ResumeSummarySchema),
    );

    return response.data;
  }

  /**
   * Get specific resume by ID
   */
  async getResumeById(id: string): Promise<Resume> {
    const response = await apiClient.get<Resume>(
      `/api/Resume/${id}`,
      ResumeSchema,
    );
    return response.data;
  }

  /**
   * Create new resume
   */
  async createResume(resumeData: CreateResume): Promise<Resume> {
    const response = await apiClient.post<Resume>(
      "/api/Resume/Save",
      resumeData,
      ResumeSchema,
    );
    return response.data;
  }

  /**
   * Create resume from file upload
   */
  async createResumeFromFile(file: File): Promise<Resume> {
    const formData = new FormData();
    formData.append("file", file);

    // Note: This will need special handling for FormData
    const response = await apiClient.request<Resume>(
      "/api/Resume/CreateFromFile",
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
      `/api/Resume/${id}`,
      updates,
      ResumeSchema,
    );
    return response.data;
  }

  /**
   * Delete resume
   */
  async deleteResume(id: string): Promise<void> {
    await apiClient.delete(`/api/Resume/${id}`);
  }

  /**
   * Clone resume
   */
  async cloneResume(id: string): Promise<Resume> {
    const response = await apiClient.post<Resume>(
      `/api/Resume/${id}/clone`,
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
      `/api/Resume/${id}/export?format=${format}`,
      { method: "GET" },
    );

    // Return the blob directly for download
    return response.data;
  }

  /**
   * Watch/track resume
   */
  async watchResume(id: string): Promise<void> {
    await apiClient.post(`/api/Resume/watch/${id}`);
  }

  /**
   * Unwatch/untrack resume
   */
  async unwatchResume(id: string): Promise<void> {
    await apiClient.post(`/api/Resume/unwatch/${id}`);
  }

  /**
   * Get AI-generated resume summary
   */
  async getResumeSummary(id: string): Promise<string> {
    const response = await apiClient.post<{ summary: string }>(
      `/api/Resume/Summarize`,
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
      `/api/Resume/SentimentPrediction`,
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
      `/api/Resume/Parse`,
      { content },
      CreateResumeSchema.partial(),
    );

    return response.data;
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const resumeService = new ResumeService();
export default resumeService;
