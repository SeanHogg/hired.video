/**
 * Résumé lists — `GET /api/resumes?owner=me&view=…&include=…` plus the
 * public directory. Exposed on `resumeService` (resume-service.ts) under the
 * historical method names; the list schemas are re-exported from there too.
 */
import { z } from "zod";
import { apiClient } from "../api-client";
import { nullableString, nullableNumber, nullableBoolean } from "@shared/api";
import {
  ResumeSchema,
  ResumeSummarySchema as SharedResumeSummarySchema,
  ResumeWithOwnershipSchema,
  type Resume,
  type ResumeWithOwnership,
} from "@shared/resume";
import { readCoverLetter } from "@shared/cover-letter";
import { CARD_FIELDS_BY_KIND, serializeListFields } from "@shared/projection";

// Loose list-row schema DERIVED from the canonical @shared/resume
// ResumeSummarySchema: every shared field optional (list endpoints honour
// `?fields=` projections), with the fields legacy payloads send as null /
// free-form strings relaxed below. Unknown keys pass through.
export const ResumeSummarySchema = SharedResumeSummarySchema
  .partial()
  .extend({
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

// Master Resume System — single source of truth lives in shared/resume.ts.
const MasterResumeGroupSchema = z.object({
  masterResume: ResumeSchema,
  variations: z.array(ResumeSchema),
});

export type ResumeSummary = z.infer<typeof ResumeSummarySchema>;
export type PaginatedResumes = z.infer<typeof PaginatedResumesSchema>;
export type MasterResumeGroup = z.infer<typeof MasterResumeGroupSchema>;

/** Get all public résumés (paged). */
export async function getPublicResumes(
  page = 1,
  limit = 20,
  options: { fields?: readonly string[] } = {},
): Promise<PaginatedResumes> {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });

  // `?fields=` projection (gap #1444) — resume `content` JSONB is the
  // heavy column; list view never needs it. Default to the card subset;
  // callers asking for the full row pass `fields: []`.
  const fields = serializeListFields("resumes", options.fields ?? CARD_FIELDS_BY_KIND.resumes);
  if (fields) params.set("fields", fields);

  const response = await apiClient.get<any>(`/api/resumes/public?${params.toString()}`, PaginatedResumesSchema);

  const dto = response.data;
  const rawItems = (dto.items || dto.Items || []) as unknown[];
  const total = (dto.total ?? dto.Total ?? (Array.isArray(rawItems) ? rawItems.length : 0)) as number;
  const pageNum = (dto.page ?? dto.Page ?? 1) as number;
  const limitNum = (dto.limit ?? dto.Limit ?? (Array.isArray(rawItems) ? rawItems.length : 0)) as number;
  const hasNext = (dto.hasNext ?? dto.hasNextPage ?? dto.HasNextPage ?? pageNum * limitNum < total) as boolean;
  const hasPrev = (dto.hasPrev ?? dto.hasPreviousPage ?? dto.HasPreviousPage ?? pageNum > 1) as boolean;

  // Normalize the resume items to have consistent property names
  const items = rawItems.map((item: any) => ({
    id: item.id,
    templateName: item.TemplateName || item.templateName,
    isPublic: item.IsPublic ?? item.isPublic,
    isOwner: item.IsOwner ?? item.isOwner,
    creationDateTimeFormatted: item.CreationDateTimeFormatted || item.creationDateTimeFormatted,
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
    createdAt: item.CreationDateTimeFormatted || item.creationDateTimeFormatted || item.createdAt,
    updatedAt: item.UpdatedAt || item.updatedAt || item.CreationDateTimeFormatted || item.creationDateTimeFormatted,
  })) as ResumeSummary[];

  return { items, total, page: pageNum, limit: limitNum, hasNext, hasPrev };
}

/** The viewer's own résumés as summary rows. */
export async function getUserResumes(): Promise<ResumeSummary[]> {
  const response = await apiClient.get<ResumeSummary[]>(
    "/api/resumes?owner=me&view=summary",
    z.array(ResumeSummarySchema),
  );
  return response.data;
}

/** The viewer's masters, each with its variations. */
export async function getMasterResumeGroups(): Promise<MasterResumeGroup[]> {
  try {
    const response = await apiClient.get<MasterResumeGroup[]>(
      "/api/resumes?owner=me&view=groups",
      z.array(MasterResumeGroupSchema),
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching master resume groups:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to load resume collections. Please try again.");
  }
}

/** The viewer's résumés (owned + tracked) with an `ownership` tag. */
export async function getResumesWithOwnership(opts: { includeArchived?: boolean } = {}): Promise<ResumeWithOwnership[]> {
  try {
    const qs = opts.includeArchived ? "&includeArchived=1" : "";
    const response = await apiClient.get<ResumeWithOwnership[]>(
      `/api/resumes?owner=me&include=ownership${qs}`,
      z.array(ResumeWithOwnershipSchema),
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching resumes with ownership:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to load resumes. Please try again.");
  }
}

// Field names match the canonical ResumeSummary in shared/resume.ts — if
// this mapping ever diverges from the backend serializer again
// (resume-contract.test.ts guards this in CI), cards will render blank.
function toOwnership(r: Resume): ResumeWithOwnership {
  return {
    id: r.id,
    userId: r.userId,
    title: r.title,
    slug: r.slug ?? null,
    status: r.status,
    privacy: r.privacy,
    isMaster: r.isMaster,
    isActive: r.isActive,
    parentId: r.parentId ?? null,
    diffPercent: r.diffPercent ?? null,
    templateId: r.templateId ?? null,
    metaResumeId: r.metaResumeId ?? null,
    sentimentScore: r.sentimentScore ?? null,
    scores: r.scores ?? null,
    viewCount: r.viewCount,
    isOwner: r.isOwner,
    isWatched: r.isWatched,
    archivedAt: r.archivedAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    headline: (r.content.basics?.label as string | undefined) ?? "",
    summary: (r.content.basics?.summary as string | undefined) ?? "",
    hasCoverLetter: readCoverLetter(r.content) !== null,
    ownership: "owned",
  };
}

export interface ResumesForDisplayOptions {
  includeArchived?: boolean;
  /** Master groups the caller already fetched (or is fetching) for its own
   *  use — passed through so the groups request fires once per load instead
   *  of twice in parallel. A rejected promise falls back to no groups here;
   *  the caller still sees the rejection on its own handle. */
  groups?: MasterResumeGroup[] | Promise<MasterResumeGroup[]>;
}

/**
 * Consolidated fetch for the /resumes page — ResumeWithOwnership[]; when
 * the ownership list is empty, falls back to master groups (masters +
 * variations) flattened into the same shape.
 */
export async function getResumesForDisplay(opts: ResumesForDisplayOptions = {}): Promise<ResumeWithOwnership[]> {
  const { groups: providedGroups, ...listOpts } = opts;
  const groupsRequest = providedGroups === undefined ? getMasterResumeGroups() : Promise.resolve(providedGroups);
  const [owned, groups] = await Promise.all([
    getResumesWithOwnership(listOpts).catch((): ResumeWithOwnership[] => []),
    groupsRequest.catch((): MasterResumeGroup[] => []),
  ]);
  if (owned.length > 0) return owned;

  const items: ResumeWithOwnership[] = [];
  for (const group of groups) {
    if (group.masterResume) items.push(toOwnership(group.masterResume));
    for (const v of group.variations) items.push(toOwnership(v));
  }
  return items;
}
