/**
 * Resume Service
 * Handles resume-related API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { nullableString, nullableNumber, nullableBoolean } from "@shared/api";
import type { ResumeData, ResumePrivacy, Resume as FrontendResume, ResumeSectionMeta } from "@/types/resume";
import { mapDisplayPrivacyToResumePrivacy } from "@/lib/privacy";

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
    // Add missing fields that are present in the API response
    isMaster: nullableBoolean(),
    isActive: nullableBoolean(),
    parentId: nullableString(),
    creationDateTime: nullableString(),
    updateDateTime: nullableString(),
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
        awards: z
          .array(
            z.object({
              id: nullableString(),
              title: nullableString(),
              date: nullableString(),
              awarder: nullableString(),
              summary: nullableString(),
            }),
          )
          .nullable()
          .transform((val) => (val === null ? undefined : val))
          .optional(),
        certificates: z
          .array(
            z.object({
              id: nullableString(),
              name: nullableString(),
              date: nullableString(),
              issuer: nullableString(),
              url: nullableString(),
            }),
          )
          .nullable()
          .transform((val) => (val === null ? undefined : val))
          .optional(),
        publications: z
          .array(
            z.object({
              id: nullableString(),
              name: nullableString(),
              publisher: nullableString(),
              releaseDate: nullableString(),
              url: nullableString(),
              summary: nullableString(),
            }),
          )
          .nullable()
          .transform((val) => (val === null ? undefined : val))
          .optional(),
        languages: z
          .array(
            z.object({
              id: nullableString(),
              language: nullableString(),
              fluency: nullableString(),
            }),
          )
          .nullable()
          .transform((val) => (val === null ? undefined : val))
          .optional(),
        interests: z
          .array(
            z.object({
              id: nullableString(),
              name: nullableString(),
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
        references: z
          .array(
            z.object({
              id: nullableString(),
              name: nullableString(),
              reference: nullableString(),
            }),
          )
          .nullable()
          .transform((val) => (val === null ? undefined : val))
          .optional(),
        projects: z
          .array(
            z.object({
              id: nullableString(),
              name: nullableString(),
              description: nullableString(),
              highlights: z
                .array(z.string())
                .nullable()
                .transform((val) => (val === null ? undefined : val))
                .optional(),
              keywords: z
                .array(z.string())
                .nullable()
                .transform((val) => (val === null ? undefined : val))
                .optional(),
              startDate: nullableString(),
              endDate: nullableString(),
              url: nullableString(),
              roles: z
                .array(z.string())
                .nullable()
                .transform((val) => (val === null ? undefined : val))
                .optional(),
              entity: nullableString(),
              type: nullableString(),
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

// Master Resume System Schemas
const ResumeWithOwnershipSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  privacy: z.enum(["public", "recruiter_only", "connections", "private", "draft"]),
  isMaster: z.boolean(),
  isActive: z.boolean(),
  parentId: nullableString(),
  createdAt: z.string(),
  updatedAt: z.string(),
  views: z.number(),
  summary: z.string(),
  title: z.string(),
  userId: z.string(),
  ownership: z.enum(["owned", "tracked"]),
});

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
  async getResumeById(id: string): Promise<FrontendResume> {
    const response = await apiClient.get<any>(
      `/api/Resume/${id}`,
      z.any(), // Use any for now since we need to transform the response
    );

    // Transform the API response to match the expected Resume interface
    return this.transformApiResumeToResume(response.data);
  }

  /**
   * Get resume for embedding (server bypasses privacy checks for this endpoint)
   */
  async getResumeForEmbed(identifier: string): Promise<FrontendResume> {
    const response = await apiClient.get<any>(
      `/api/Resume/embedded/${identifier}`,
      z.any(),
    );
    return this.transformApiResumeToResume(response.data);
  }


  /**
   * Create new resume from CreateResumeRequest
   */
  async createResume(request: {
    name: string;
    data: ResumeData;
    privacy?: string;
    isMaster?: boolean;
    isActive?: boolean;
  }): Promise<Resume> {
    // Convert ResumeData to JSON string format expected by backend
    const resumeJson = JSON.stringify(request.data);

    const response = await apiClient.request<Resume>(
      "/api/Resume/Save",
      {
        method: "POST",
        body: resumeJson,
        headers: {
          'Content-Type': 'application/json',
        },
      },
      ResumeSchema,
    );
    return response.data;
  }

  /**
   * Parse resume from file upload (without saving)
   */
  async parseResumeFromFile(file: File): Promise<{
    data: ResumeData;
    confidence: number;
  }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.request<{
      result: string;
      errorMessage?: string;
    }>(
      "/api/Resume/Parse",
      {
        method: "POST",
        body: formData,
        headers: {}, // Remove Content-Type to let browser set it for FormData
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

      // Convert to ResumeData format
      const resumeData: ResumeData = {
        Basics: {
          Name: parsedData.basics?.name ?? "",
          Label: parsedData.basics?.label ?? "",
          Image: parsedData.basics?.image ?? "",
          Email: parsedData.basics?.email ?? "",
          Phone: parsedData.basics?.phone ?? "",
          Url: parsedData.basics?.url ?? "",
          Summary: parsedData.basics?.summary ?? "",
          Location: parsedData.basics?.location
            ? {
              Address: parsedData.basics.location.address ?? "",
              PostalCode: parsedData.basics.location.postalCode ?? "",
              City: parsedData.basics.location.city ?? "",
              CountryCode: parsedData.basics.location.countryCode ?? "",
              Region: parsedData.basics.location.region ?? "",
            }
            : null,
        },
        Work: Array.isArray(parsedData.work)
          ? parsedData.work.map((w: any) => ({
            Name: w?.name ?? w?.company ?? "",
            Position: w?.position ?? "",
            Summary: w?.summary ?? "",
            StartDate: w?.startDate ?? "",
            EndDate: w?.endDate ?? "",
            Highlights: Array.isArray(w?.highlights) ? w.highlights : [],
            Url: w?.url ?? "",
          }))
          : [],
        Education: Array.isArray(parsedData.education)
          ? parsedData.education.map((e: any) => ({
            Institution: e?.institution ?? "",
            Area: e?.area ?? "",
            StudyType: e?.studyType ?? "",
            StartDate: e?.startDate ?? "",
            EndDate: e?.endDate ?? "",
            Score: e?.score ?? "",
            Courses: Array.isArray(e?.courses) ? e.courses : null,
            Url: e?.url ?? "",
          }))
          : [],
        Skills: Array.isArray(parsedData.skills)
          ? parsedData.skills.map((s: any) => ({
            Name: s?.name ?? "",
            Level: s?.level ?? "",
            Keywords: Array.isArray(s?.keywords) ? s.keywords : [],
          }))
          : [],
        Volunteer: [],
        Awards: [],
        Certificates: [],
        Publications: [],
        Languages: [],
        Interests: [],
        References: [],
        Projects: [],
        Meta: undefined,
      };

      return {
        data: resumeData,
        confidence: 0.8, // Default confidence score
      };
    } catch (parseError) {
      throw new Error(`Failed to parse resume data: ${parseError}`);
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
   * Update resume with new data structure
   */
  async updateResumeData(
    id: string,
    updates: {
      name?: string;
      data?: ResumeData;
      privacy?: ResumePrivacy;
      isMaster?: boolean;
      metaData?: ResumeSectionMeta[];
    },
  ): Promise<FrontendResume> {
    // Convert ResumeData to JSON string format expected by backend
    const payload: any = {};

    if (updates.name) payload.name = updates.name;
    if (updates.privacy) payload.privacy = updates.privacy;
    if (updates.isMaster !== undefined) payload.isMaster = updates.isMaster;
    if (updates.data) payload.resumeSerialized = JSON.stringify(updates.data);
    if (updates.metaData) payload.metaData = updates.metaData;

    const response = await apiClient.put<any>(
      `/api/Resume/${id}`,
      payload,
      z.any(),
    );

    // Transform the response back to frontend format
    return this.transformApiResumeToResume(response.data);
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
   * Transform API resume response to frontend Resume interface
   */
  private transformApiResumeToResume(apiResponse: any): FrontendResume {

    let metaResume = apiResponse.metaResume || {};
    let basics = metaResume.basics || {};
    let work = metaResume.work || [];
    let education = metaResume.education || [];
    let volunteer = metaResume.volunteer || [];
    let awards = metaResume.awards || [];
    let certificates = metaResume.certificates || [];
    let publications = metaResume.publications || [];
    let skills = metaResume.skills || [];
    let languages = metaResume.languages || [];
    let interests = metaResume.interests || [];
    let references = metaResume.references || [];
    let projects = metaResume.projects || [];

    // Fallback: If metaResume is incomplete but resumeSerialized exists, use that
    if ((!basics.name && !basics.label) && apiResponse.resumeSerialized) {
      try {
        const serializedData = JSON.parse(apiResponse.resumeSerialized);

        // Use the serialized data if it has more complete information
        if (serializedData.Basics || serializedData.basics) {
          const serializedBasics = serializedData.Basics || serializedData.basics;
          const serializedWork = serializedData.Work || serializedData.work || [];
          const serializedEducation = serializedData.Education || serializedData.education || [];
          const serializedVolunteer = serializedData.Volunteer || serializedData.volunteer || [];
          const serializedAwards = serializedData.Awards || serializedData.awards || [];
          const serializedCertificates = serializedData.Certificates || serializedData.certificates || [];
          const serializedPublications = serializedData.Publications || serializedData.publications || [];
          const serializedSkills = serializedData.Skills || serializedData.skills || [];
          const serializedLanguages = serializedData.Languages || serializedData.languages || [];
          const serializedInterests = serializedData.Interests || serializedData.interests || [];
          const serializedReferences = serializedData.References || serializedData.references || [];
          const serializedProjects = serializedData.Projects || serializedData.projects || [];

          // Convert PascalCase to camelCase for consistency with existing logic
          basics = {
            name: serializedBasics.Name || serializedBasics.name || "",
            label: serializedBasics.Label || serializedBasics.label || "",
            image: serializedBasics.Image || serializedBasics.image || "",
            email: serializedBasics.Email || serializedBasics.email || "",
            phone: serializedBasics.Phone || serializedBasics.phone || "",
            url: serializedBasics.Url || serializedBasics.url || "",
            summary: serializedBasics.Summary || serializedBasics.summary || "",
            location: serializedBasics.Location || serializedBasics.location || null
          };

          work = serializedWork.map((w: any) => ({
            name: w.Name || w.name || w.Company || w.company || "",
            position: w.Position || w.position || "",
            summary: w.Summary || w.summary || "",
            startDate: w.StartDate || w.startDate || "",
            endDate: w.EndDate || w.endDate || "",
            highlights: w.Highlights || w.highlights || [],
            url: w.Url || w.url || ""
          }));

          education = serializedEducation.map((e: any) => ({
            institution: e.Institution || e.institution || "",
            area: e.Area || e.area || "",
            studyType: e.StudyType || e.studyType || "",
            startDate: e.StartDate || e.startDate || "",
            endDate: e.EndDate || e.endDate || "",
            score: e.Score || e.score || "",
            courses: e.Courses || e.courses || null,
            url: e.Url || e.url || ""
          }));

          volunteer = serializedVolunteer.map((v: any) => ({
            organization: v.Organization || v.organization || "",
            position: v.Position || v.position || "",
            summary: v.Summary || v.summary || "",
            startDate: v.StartDate || v.startDate || "",
            endDate: v.EndDate || v.endDate || "",
            highlights: v.Highlights || v.highlights || null,
            url: v.Url || v.url || ""
          }));

          awards = serializedAwards.map((a: any) => ({
            title: a.Title || a.title || "",
            date: a.Date || a.date || "",
            awarder: a.Awarder || a.awarder || "",
            summary: a.Summary || a.summary || ""
          }));

          certificates = serializedCertificates.map((c: any) => ({
            name: c.Name || c.name || "",
            date: c.Date || c.date || "",
            issuer: c.Issuer || c.issuer || "",
            url: c.Url || c.url || ""
          }));

          publications = serializedPublications.map((p: any) => ({
            name: p.Name || p.name || "",
            publisher: p.Publisher || p.publisher || "",
            releaseDate: p.ReleaseDate || p.releaseDate || "",
            url: p.Url || p.url || "",
            summary: p.Summary || p.summary || ""
          }));

          skills = serializedSkills.map((s: any) => ({
            name: s.Name || s.name || "",
            level: s.Level || s.level || "",
            keywords: s.Keywords || s.keywords || []
          }));

          languages = serializedLanguages.map((l: any) => ({
            language: l.Language || l.language || "",
            fluency: l.Fluency || l.fluency || ""
          }));

          interests = serializedInterests.map((i: any) => ({
            name: i.Name || i.name || "",
            keywords: i.Keywords || i.keywords || []
          }));

          references = serializedReferences.map((r: any) => ({
            name: r.Name || r.name || "",
            reference: r.Reference || r.reference || ""
          }));

          projects = serializedProjects.map((p: any) => ({
            name: p.Name || p.name || "",
            description: p.Description || p.description || "",
            highlights: p.Highlights || p.highlights || [],
            keywords: p.Keywords || p.keywords || [],
            startDate: p.StartDate || p.startDate || "",
            endDate: p.EndDate || p.endDate || "",
            url: p.Url || p.url || "",
            roles: p.Roles || p.roles || [],
            entity: p.Entity || p.entity || "",
            type: p.Type || p.type || ""
          }));
        }
      } catch (error) {
        console.error("transformApiResumeToResume - Error parsing resumeSerialized:", error);
      }
    }

    // If metaResume has data but we haven't processed it yet, process it now
    if (!basics.name && metaResume.basics) {
      basics = {
        id: metaResume.basics.id || metaResume.basics.Id,
        name: metaResume.basics.name || "",
        label: metaResume.basics.label || "",
        image: metaResume.basics.image || "",
        email: metaResume.basics.email || "",
        phone: metaResume.basics.phone || "",
        url: metaResume.basics.url || "",
        summary: metaResume.basics.summary || "",
        location: metaResume.basics.location || null
      };
    }

    // Process other sections from metaResume if they exist
    if (metaResume.work && work.length === 0) {
      work = metaResume.work.map((w: any) => ({
        id: w.id || w.Id,
        name: w.name || "",
        position: w.position || "",
        summary: w.summary || "",
        startDate: w.startDate || "",
        endDate: w.endDate || "",
        highlights: w.highlights || [],
        url: w.url || ""
      }));
    }

    if (metaResume.education && education.length === 0) {
      education = metaResume.education.map((e: any) => ({
        id: e.id || e.Id,
        institution: e.institution || "",
        area: e.area || "",
        studyType: e.studyType || "",
        startDate: e.startDate || "",
        endDate: e.endDate || "",
        score: e.score || "",
        courses: e.courses || null,
        url: e.url || ""
      }));
    }

    if (metaResume.volunteer && volunteer.length === 0) {
      volunteer = metaResume.volunteer.map((v: any) => ({
        id: v.id || v.Id,
        organization: v.organization || "",
        position: v.position || "",
        summary: v.summary || "",
        startDate: v.startDate || "",
        endDate: v.endDate || "",
        highlights: v.highlights || null,
        url: v.url || ""
      }));
    }

    if (metaResume.skills && skills.length === 0) {
      skills = metaResume.skills.map((s: any) => ({
        id: s.id || s.Id,
        name: s.name || "",
        level: s.level || "",
        keywords: s.keywords || []
      }));
    }

    // Debug: Log the actual API response structure to understand what we're getting
    console.log("API Response Structure:", {
      hasMetaResume: !!apiResponse.metaResume,
      hasResumeSerialized: !!apiResponse.resumeSerialized,
      metaResumeKeys: apiResponse.metaResume ? Object.keys(apiResponse.metaResume) : [],
      basicsKeys: basics ? Object.keys(basics) : [],
      apiResponseKeys: Object.keys(apiResponse)
    });

    // Centralized privacy mapping
    const mapPrivacy = mapDisplayPrivacyToResumePrivacy;

    // Transform to ResumeData format (preserve section Ids when present)
    const resumeData: ResumeData = {
      Basics: {
        Id: basics.id || basics.Id || undefined,
        Name: basics.name || "",
        Label: basics.label || "",
        Image: basics.image || "",
        Email: basics.email || "",
        Phone: basics.phone || "",
        Url: basics.url || "",
        Summary: basics.summary || "",
        Location: basics.location ? {
          Address: basics.location.Address || basics.location.address || "",
          PostalCode: basics.location.PostalCode || basics.location.postalCode || "",
          City: basics.location.City || basics.location.city || "",
          CountryCode: basics.location.CountryCode || basics.location.countryCode || "",
          Region: basics.location.Region || basics.location.region || "",
        } : null,
      },
      Work: work.map((w: any) => ({
        Id: w.id || w.Id || undefined,
        Name: w.name || "",
        Position: w.position || "",
        Summary: w.summary || "",
        StartDate: w.startDate || "",
        EndDate: w.endDate || "",
        Highlights: w.highlights || [],
        Url: w.url || "",
      })),
      Education: education.map((e: any) => ({
        Id: e.id || e.Id || undefined,
        Institution: e.institution || "",
        Area: e.area || "",
        StudyType: e.studyType || "",
        StartDate: e.startDate || "",
        EndDate: e.endDate || "",
        Score: e.score || "",
        Courses: e.courses || null,
        Url: e.url || "",
      })),
      Skills: skills.map((s: any) => ({
        Id: s.id || s.Id || undefined,
        Name: s.name || "",
        Level: s.level || "",
        Keywords: Array.isArray(s.keywords) ? s.keywords : [],
      })),
      Volunteer: volunteer.map((v: any) => ({
        Id: v.id || v.Id || undefined,
        Organization: v.organization || "",
        Position: v.position || "",
        Summary: v.summary || "",
        StartDate: v.startDate || "",
        EndDate: v.endDate || "",
        Highlights: v.highlights || null,
        Url: v.url || "",
      })),
      Awards: awards.map((a: any) => ({
        Id: a.id || a.Id || undefined,
        Title: a.title || "",
        Date: a.date || "",
        Awarder: a.awarder || "",
        Summary: a.summary || "",
      })),
      Certificates: certificates.map((c: any) => ({
        Id: c.id || c.Id || undefined,
        Name: c.name || "",
        Date: c.date || "",
        Issuer: c.issuer || "",
        Url: c.url || "",
      })),
      Publications: publications.map((p: any) => ({
        Id: p.id || p.Id || undefined,
        Name: p.name || "",
        Publisher: p.publisher || "",
        ReleaseDate: p.releaseDate || "",
        Url: p.url || "",
        Summary: p.summary || "",
      })),
      Languages: languages.map((l: any) => ({
        Id: l.id || l.Id || undefined,
        Language: l.language || "",
        Fluency: l.fluency || "",
      })),
      Interests: interests.map((i: any) => ({
        Id: i.id || i.Id || undefined,
        Name: i.name || "",
        Keywords: i.keywords || [],
      })),
      References: references.map((r: any) => ({
        Id: r.id || r.Id || undefined,
        Name: r.name || "",
        Reference: r.reference || "",
      })),
      Projects: projects.map((p: any) => ({
        Id: p.id || p.Id || undefined,
        Name: p.name || "",
        Description: p.description || "",
        Highlights: p.highlights || [],
        Keywords: p.keywords || [],
        StartDate: p.startDate || "",
        EndDate: p.endDate || "",
        Url: p.url || "",
        Roles: p.roles || [],
        Entity: p.entity || "",
        Type: p.type || "",
      })),
    };

    // Normalize MetaData list from API
    const rawMeta: any[] | undefined = apiResponse.metaData || apiResponse.MetaData;
    const metaData = Array.isArray(rawMeta)
      ? rawMeta.map((m: any) => ({
          id: m.id || m.Id || "",
          userId: m.userId || m.UserId || "",
          referenceId: m.referenceId || m.ReferenceId || "",
          name: m.name || m.Name || "",
          metaType: (typeof m.metaType === "number" ? m.metaType : parseInt(m.metaType, 10)) as number,
          url: m.url || m.Url || "",
          description: m.description || m.Description || undefined,
          creationDateTime: m.creationDateTime || m.CreationDateTime || undefined,
        }))
      : undefined;

    // Return the transformed Resume object
    return {
      id: apiResponse.id || "",
      slug: apiResponse.slug || apiResponse.Slug || "",
      name: apiResponse.name || apiResponse.Name || "",
      data: resumeData,
      privacy: mapPrivacy(apiResponse.privacy_ShowResume || apiResponse.Privacy_ShowResume || 0),
      isMaster: apiResponse.isMaster || apiResponse.IsMaster || false,
      isActive: apiResponse.isActive || apiResponse.IsActive || false,
      parentId: apiResponse.parentId || undefined,
      createdAt: apiResponse.creationDateTime || new Date().toISOString(),
      updatedAt: apiResponse.updateDateTime || new Date().toISOString(),
      views: apiResponse.views || 0,
      userId: apiResponse.userId || "",
      metaData,
    } as FrontendResume;
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

  // Master Resume System Methods

  /**
   * Set a resume as the master resume
   */
  async setMasterResume(id: string): Promise<boolean> {
    try {
      const response = await apiClient.post<boolean>(
        `/api/Resume/${id}/setMaster`,
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
        `/api/Resume/${id}/setActive`,
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
      `/api/Resume/${id}/setPrivacy`,
      { privacy },
      z.boolean()
    );
    return response.data === true;
  }

  /** Promote a variant to be the new master resume */
  async promoteVariantToMaster(id: string): Promise<boolean> {
    try {
      const response = await apiClient.post<boolean>(
        `/api/Resume/${id}/promote`,
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
  async createResumeVariation(parentId: string, name: string): Promise<Resume> {
    try {
      const response = await apiClient.post<Resume>(
        `/api/Resume/${parentId}/createVariation`,
        { name },
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
        `/api/Resume/masterGroups`,
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

    // Fallback: flatten master groups into ResumeWithOwnership entries
    const items: ResumeWithOwnership[] = [];

    const extractSummary = (resumeSerialized?: string): string => {
      try {
        if (!resumeSerialized) return "";
        const obj = JSON.parse(resumeSerialized);
        return obj?.Basics?.Summary || obj?.basics?.summary || "";
      } catch {
        return "";
      }
    };

    for (const group of groups) {
      const master = group.masterResume;
      if (master) {
        items.push({
          id: master.id || "",
          slug: master.slug || "",
          name: master.name || "",
          privacy: mapDisplayPrivacyToResumePrivacy(master.privacy_ShowResume || 10),
          isMaster: master.isMaster || false,
          isActive: master.isActive || false,
          parentId: master.parentId || undefined,
          createdAt: master.creationDateTime || master.createdAt || new Date().toISOString(),
          updatedAt: master.updateDateTime || master.updatedAt || new Date().toISOString(),
          views: master.views || 0,
          summary: extractSummary(master.resumeSerialized || undefined),
          title: master.metaResume?.basics?.label || "",
          userId: master.userId || "",
          ownership: "owned",
        });
      }

      for (const v of group.variations) {
        items.push({
          id: v.id || "",
          slug: v.slug || "",
          name: v.name || "",
          privacy: mapDisplayPrivacyToResumePrivacy(v.privacy_ShowResume || 10),
          isMaster: v.isMaster || false,
          isActive: v.isActive || false,
          parentId: v.parentId || undefined,
          createdAt: v.creationDateTime || v.createdAt || new Date().toISOString(),
          updatedAt: v.updateDateTime || v.updatedAt || new Date().toISOString(),
          views: v.views || 0,
          summary: extractSummary(v.resumeSerialized || undefined),
          title: v.metaResume?.basics?.label || "",
          userId: v.userId || "",
          ownership: "owned",
        });
      }
    }

    return items;
  }


  /**
   * Get resumes with ownership information
   */
  async getResumesWithOwnership(): Promise<ResumeWithOwnership[]> {
    try {
      const response = await apiClient.get<ResumeWithOwnership[]>(
        `/api/Resume/withOwnership`,
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
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const resumeService = new ResumeService();
export default resumeService;
