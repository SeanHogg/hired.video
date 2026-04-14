/**
 * Card Feed Aggregator
 *
 * Calls the domain-specific public endpoints (`/api/resumes/public`,
 * `/api/jobs/public`, `/api/companies/public`, `/api/users/public`) in parallel
 * and returns a single, sortable stream of `RawApiItem` entries ready for the
 * card-factory to render. Replaces the previous path that went through
 * `searchService.searchPublicContent()` and relied on a trimmed cross-type DTO
 * that stripped card-required fields (professional summary, owner id, etc.).
 *
 * Every item exposes a common `sortKey` so mixed-type feeds can merge and order
 * across domains without needing a server-side unified response.
 */

import type { RawApiItem } from "@/types/normalized-cards";
import { resumeService } from "@/lib/services/resume-service";
import { jobService } from "@/lib/services/job-service";
import { companyService } from "@/lib/services/company-service";
import { userService } from "@/lib/services/user-service";

export type CardFeedType = "resume" | "job" | "company" | "people";

export type CardFeedSort = "recent" | "featured" | "top";

export interface SortableCard extends RawApiItem {
  sortKey: {
    createdAt: string;
    views: number;
    featured: boolean;
  };
}

export interface CardFeedOptions {
  types?: CardFeedType[];
  limitPerType?: number;
  page?: number;
  sort?: CardFeedSort;
  search?: string;
  location?: string;
}

export interface CardFeedResponse {
  items: SortableCard[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

const DEFAULT_TYPES: CardFeedType[] = ["resume", "job", "company", "people"];

/**
 * Derive a common sort key from a normalized item so mixed feeds can be ordered
 * uniformly without inspecting type-specific fields.
 */
function toSortKey(item: RawApiItem): SortableCard["sortKey"] {
  return {
    createdAt: (item.createdAt as string) || (item.updatedAt as string) || new Date(0).toISOString(),
    views: (item.views as number) ?? 0,
    featured: Boolean(item.isFeatured),
  };
}

function compare(a: SortableCard, b: SortableCard, sort: CardFeedSort): number {
  if (sort === "featured") {
    if (a.sortKey.featured !== b.sortKey.featured) {
      return a.sortKey.featured ? -1 : 1;
    }
  }
  if (sort === "top") {
    if (a.sortKey.views !== b.sortKey.views) {
      return b.sortKey.views - a.sortKey.views;
    }
  }
  // Default: most recent first. Also used as the tiebreaker for featured/top.
  return (
    new Date(b.sortKey.createdAt).getTime() - new Date(a.sortKey.createdAt).getTime()
  );
}

async function fetchResumes(limit: number, page: number): Promise<SortableCard[]> {
  try {
    const result = await resumeService.getPublicResumes(page, limit);
    return result.items.map((r: any) => {
      const item: RawApiItem = {
        ...r,
        type: "resume",
        // Canonicalize the fields that card-normalizers / ResumeCard read, so
        // Pascal/camel-case from the service is flattened into a single shape.
        id: r.id,
        userId: r.userId,
        slug: r.slug,
        name: r.name ?? r.title,
        title: r.title ?? r.name,
        summary: r.description ?? r.summary ?? "",
        privacy: r.privacy ?? (r.isPublic ? "public" : "private"),
        isMaster: r.isMaster ?? false,
        isActive: r.isActive ?? false,
        parentId: r.parentId ?? null,
        isOwner: r.isOwner ?? false,
        views: r.views ?? 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
      return { ...item, sortKey: toSortKey(item) };
    });
  } catch (err) {
    console.error("card-feed: resume fetch failed", err);
    return [];
  }
}

async function fetchJobs(limit: number, page: number): Promise<SortableCard[]> {
  try {
    const result = await jobService.getPublicJobs({ page, limit });
    return result.items.map((j: any) => {
      const item: RawApiItem = {
        ...j,
        type: "job",
        id: j.id,
        title: j.title,
        name: j.title,
        company: j.company,
        location: j.location,
        summary: j.summary ?? j.description ?? "",
        employmentType: j.employmentType ?? j.jobType,
        experienceLevel: j.experienceLevel,
        salary: j.salary,
        views: j.views ?? 0,
        applications: j.applications ?? 0,
        userId: j.userId ?? j.postedBy,
        createdAt: j.createdAt ?? j.postedDate,
        updatedAt: j.updatedAt,
      };
      return { ...item, sortKey: toSortKey(item) };
    });
  } catch (err) {
    console.error("card-feed: job fetch failed", err);
    return [];
  }
}

async function fetchCompanies(limit: number, page: number): Promise<SortableCard[]> {
  try {
    const result = await companyService.getPublicCompanies({ page, limit });
    const companies = (result as any).items ?? result ?? [];
    return (companies as any[]).map((c: any) => {
      const item: RawApiItem = {
        ...c,
        type: "company",
        id: c.id,
        name: c.name,
        logo: c.logo ?? c.logoUrl,
        industry: c.industry,
        size: c.size,
        tagline: c.tagline ?? c.description,
        summary: c.description ?? c.summary ?? "",
        location: c.location ?? c.headquarters,
        activeJobCount: c.activeJobCount ?? 0,
        followers: c.followerCount ?? c.followers ?? 0,
        status: c.status ?? (c.isActive ? "active" : "inactive"),
        userId: c.userId ?? c.ownerId,
        views: c.views ?? 0,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
      return { ...item, sortKey: toSortKey(item) };
    });
  } catch (err) {
    console.error("card-feed: company fetch failed", err);
    return [];
  }
}

async function fetchPeople(limit: number, page: number): Promise<SortableCard[]> {
  try {
    const result = await userService.getPublicUsers({ page, limit });
    return result.items.map((p: any) => {
      const item: RawApiItem = {
        ...p,
        type: "people",
        id: p.id,
        name: p.fullName ?? p.name,
        fullName: p.fullName ?? p.name,
        headline: p.headline ?? p.currentRole,
        avatar: p.avatar,
        location: p.location,
        role: p.role,
        currentCompany: p.currentCompany ?? p.company,
        company: p.currentCompany ?? p.company,
        openToWork: p.openToWork ?? false,
        emailConfirmed: p.emailConfirmed ?? false,
        summary: p.summary ?? "",
        slug: p.slug,
        userId: p.id,
        views: p.views ?? 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
      return { ...item, sortKey: toSortKey(item) };
    });
  } catch (err) {
    console.error("card-feed: people fetch failed", err);
    return [];
  }
}

/**
 * Fetch a mixed-type card feed by fanning out to per-domain endpoints.
 * Merges results and sorts client-side using the shared sort key. The
 * response shape matches the legacy `SearchResponse` (items + pagination)
 * so callers that previously consumed `searchService.searchPublicContent`
 * can swap in with minimal churn.
 */
export async function fetchCardFeed(
  options: CardFeedOptions = {},
): Promise<CardFeedResponse> {
  const {
    types = DEFAULT_TYPES,
    limitPerType = 8,
    page = 1,
    sort = "recent",
  } = options;

  const tasks: Promise<SortableCard[]>[] = [];
  if (types.includes("resume")) tasks.push(fetchResumes(limitPerType, page));
  if (types.includes("job")) tasks.push(fetchJobs(limitPerType, page));
  if (types.includes("company")) tasks.push(fetchCompanies(limitPerType, page));
  if (types.includes("people")) tasks.push(fetchPeople(limitPerType, page));

  const results = await Promise.all(tasks);
  const merged = results.flat();
  merged.sort((a, b) => compare(a, b, sort));

  const total = merged.length;
  const limit = limitPerType * (types.length || DEFAULT_TYPES.length);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items: merged,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/**
 * Fetch a single card-type feed. Thin wrapper that keeps callers from having
 * to know which domain service owns which endpoint.
 */
export async function fetchCardFeedByType(
  type: CardFeedType,
  options: Omit<CardFeedOptions, "types"> = {},
): Promise<CardFeedResponse> {
  return fetchCardFeed({ ...options, types: [type] });
}
