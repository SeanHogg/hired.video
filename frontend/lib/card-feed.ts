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
import { studioService } from "@/lib/services/studio-service";
import { studioTemplatesService } from "@/lib/services/studio-templates-service";
import { eventsService } from "@/lib/services/events-service";
import { getStaticTemplates } from "@/lib/templates/registry";
import { BLOG_POSTS } from "@/data/blog-posts";
import { HELP_FAQS, HELP_GUIDES } from "@/data/help-faqs";
import { TOOLS_CATALOG } from "@/data/tools-catalog";

export type CardFeedType =
  | "resume"
  | "job"
  | "company"
  | "people"
  | "video"
  | "template"
  | "article"
  | "guide"
  | "tool"
  | "faq"
  | "event";

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
  /**
   * Structured geo filter — see shared/content-locations.ts.
   * Wired into per-domain fetchers that support content_locations
   * (jobs today; articles/videos/services to follow in #1144). Fetchers
   * that don't yet honor it ignore these fields silently.
   */
  geo?: {
    countryId?: number;
    stateId?: string;
    cityId?: string;
    radiusKm?: number;
    remote?: boolean;
  };
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

const DEFAULT_TYPES: CardFeedType[] = [
  "resume",
  "job",
  "company",
  "people",
  "video",
  "template",
  "article",
  "guide",
  "tool",
  "faq",
  "event",
];

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

interface TypedFetchResult {
  items: SortableCard[];
  total: number;
}

/** Minimum length a search query must reach before any fetcher (or any
 *  client-side filter) treats it as an active filter. Below this length
 *  the query is silently treated as empty so:
 *    - the first keystroke ("R") doesn't fire a fanout to every per-domain
 *      endpoint with a noise-tier filter,
 *    - the user keeps seeing the default feed until the query is real,
 *    - URL deep links like `/?q=A` degrade gracefully to the full feed
 *      instead of an empty results page.
 *  2 chars instead of 3 because real platform queries like "AI", "Go",
 *  "QA", "UX", "VP", "ML", "C#" are common skill/role searches our
 *  audience types verbatim. */
export const MIN_SEARCH_QUERY_LENGTH = 2;

/** Single source of truth for "does this raw input count as an active
 *  search query?" Trims, then gates by `MIN_SEARCH_QUERY_LENGTH`.
 *  Returns the empty string when the query is too short — callers can
 *  use the returned value directly as a needle (empty needle = no
 *  filter per `matchesNeedle`) and as a dedupe-key component (the same
 *  effective empty string for "", "A", " ", null). Used by card-feed
 *  fetchers AND by `UnifiedSearch` client-side filtering so both sides
 *  of the seam agree — per the DRY rule, if 1 char shouldn't filter
 *  the fetch it shouldn't filter the in-memory narrowing either. */
export function effectiveSearchQuery(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  return trimmed.length >= MIN_SEARCH_QUERY_LENGTH ? trimmed : "";
}

/** Lowercased needle-includes match against any of the candidate strings.
 *  Returns true when needle is empty so callers can pass the search filter
 *  through unconditionally — the empty-needle case is the "no filter"
 *  path. Used by every static fetcher (articles, guides, tools, faqs,
 *  templates) so a single keyword like "research" narrows the in-memory
 *  catalogue BEFORE pagination — without this, recent items push relevant
 *  matches off the first page and search appears broken. */
function matchesNeedle(needle: string, ...haystack: Array<string | null | undefined>): boolean {
  if (!needle) return true;
  const q = needle.toLowerCase();
  return haystack.some((s) => typeof s === "string" && s.toLowerCase().includes(q));
}

async function fetchResumes(limit: number, page: number): Promise<TypedFetchResult> {
  try {
    const result = await resumeService.getPublicResumes(page, limit);
    const items = (result.items ?? []).map((r: any) => {
      const item: RawApiItem = {
        ...r,
        type: "resume",
        id: r.id,
        userId: r.userId,
        slug: r.slug,
        title: r.title,
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
    return { items, total: (result as any).total ?? items.length };
  } catch (err) {
    console.error("card-feed: resume fetch failed", err);
    return { items: [], total: 0 };
  }
}

async function fetchJobs(
  limit: number,
  page: number,
  geo?: CardFeedOptions["geo"],
): Promise<TypedFetchResult> {
  try {
    const result = await jobService.getPublicJobs({
      page,
      limit,
      countryId: geo?.countryId,
      stateId: geo?.stateId,
      cityId: geo?.cityId,
      radiusKm: geo?.radiusKm,
      isRemote: geo?.remote,
    });
    const items = (result.items ?? []).map((j: any) => {
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
    return { items, total: (result as any).total ?? items.length };
  } catch (err) {
    console.error("card-feed: job fetch failed", err);
    return { items: [], total: 0 };
  }
}

async function fetchCompanies(
  limit: number,
  page: number,
): Promise<TypedFetchResult> {
  try {
    const result = await companyService.getPublicCompanies({ page, limit });
    const companies = (result as any).items ?? result ?? [];
    const items = (companies as any[]).map((c: any) => {
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
    return { items, total: (result as any).total ?? items.length };
  } catch (err) {
    console.error("card-feed: company fetch failed", err);
    return { items: [], total: 0 };
  }
}

async function fetchTemplates(
  limit: number,
  page: number,
  search?: string,
): Promise<TypedFetchResult> {
  // Pulled through the unified template registry so resume + studio
  // (built-in and creator-published) templates surface under the same
  // "templates" category. New kinds register in one place and land here
  // automatically.
  //
  // #1613: filter by search query client-side against the static catalog
  // (name + blurb + industry + tags). The original bug was that
  // ?q=education returned every static template ignored of search — only
  // pagination narrowed it. Backend unification (resumes + studio +
  // future job/learning_path templates) lands separately via
  // /api/search/public; until that path is wired into card-feed, the
  // client-side filter against the static catalog covers the reported
  // UX: typing in the search box narrows the visible templates.
  const haystack = getStaticTemplates();
  const staticFiltered = search && search.trim().length > 0
    ? haystack.filter((t) => templateMatchesQuery(t, search))
    : haystack;
  // Stable synthetic createdAt so sort order is deterministic across reloads
  // and templates don't all pile up at the exact same instant.
  const baseTime = new Date("2026-01-01T00:00:00Z").getTime();
  const staticItems = staticFiltered.map((meta, idx) => {
    const createdAt = new Date(baseTime - idx * 60_000).toISOString();
    const item: RawApiItem = {
      type: "template",
      id: meta.slug,
      name: meta.name,
      title: meta.name,
      industry: meta.industry,
      summary: meta.blurb,
      priceCents: meta.priceCents,
      // Carry the unified meta so the card layer renders kind-aware previews
      // without re-resolving the slug.
      meta,
      views: 0,
      createdAt,
    } as RawApiItem;
    return { ...item, sortKey: toSortKey(item) };
  });

  // #1626: merge DB-published creator studio templates with the
  // code-defined built-ins/presets. The static catalogue is NOT a
  // stopgap — built-ins + resume presets are legitimately client-side
  // (code-defined render templates). The gap was that creators' public
  // studio templates (real DB rows) never showed in the templates feed.
  // Best-effort: a backend hiccup falls back to the static set alone.
  let dbItems: SortableCard[] = [];
  try {
    const rows = await studioTemplatesService.listPublic({
      search: search?.trim() || undefined,
      limit: 100,
    });
    const staticKeys = new Set(staticFiltered.map((t) => t.slug));
    dbItems = rows
      .filter((r) => !staticKeys.has(r.listingSlug ?? r.id))
      .map((r) => {
        const item: RawApiItem = {
          type: "template",
          id: r.listingSlug ?? r.id,
          name: r.name,
          title: r.name,
          summary: r.description ?? "",
          priceCents: r.priceCents,
          avatar: r.thumbnailUrl ?? undefined,
          views: r.viewCount ?? 0,
          createdAt: (r.publishedAt ?? r.createdAt) as string,
        } as RawApiItem;
        return { ...item, sortKey: toSortKey(item) };
      });
  } catch (err) {
    console.warn("card-feed: studio template fetch failed, using static catalogue only", err);
  }

  const merged = [...staticItems, ...dbItems];
  const start = Math.max(0, (page - 1) * limit);
  const slice = merged.slice(start, start + limit);
  return { items: slice, total: merged.length };
}

/** Case-insensitive match across the searchable text fields of a static
 *  template meta. Mirrors the matchesQuery helper in
 *  frontend/lib/templates/registry.ts so /search and /studio surfaces
 *  filter identically. */
function templateMatchesQuery(meta: ReturnType<typeof getStaticTemplates>[number], query: string): boolean {
  const needle = query.toLowerCase().trim();
  if (!needle) return true;
  if (meta.name.toLowerCase().includes(needle)) return true;
  if (meta.blurb.toLowerCase().includes(needle)) return true;
  if (meta.industry?.toLowerCase().includes(needle)) return true;
  return (meta.tags ?? []).some((t) => t.toLowerCase().includes(needle));
}

async function fetchArticles(
  limit: number,
  page: number,
  search = "",
): Promise<TypedFetchResult> {
  // Two sources merge into the "articles" feed:
  //   (a) the static editorial blog at frontend/data/blog-posts.ts — hired.video's
  //       owned content, primarily SEO-driven.
  //   (b) creator-published articles from /api/articles/public — user-authored
  //       long-form (#170 foundation; engagement tracking + Partner Program
  //       payouts come later).
  // Both surface as `type: "article"` cards so search treats them identically.
  const sortedStatic = [...BLOG_POSTS]
    .filter((p) =>
      matchesNeedle(search, p.title, p.description, p.keywords, p.category, p.slug),
    )
    .sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  const staticItems: RawApiItem[] = sortedStatic.map((post) => ({
    type: "article",
    id: `blog-${post.slug}`,
    slug: post.slug,
    name: post.title,
    title: post.title,
    summary: post.description,
    category: post.category,
    keywords: post.keywords,
    href: `/blog/${post.slug}`,
    author: post.author,
    readingTime: post.readingTime,
    createdAt: post.publishedAt,
    updatedAt: post.updatedAt,
    views: 0,
    isOfficial: true,
  } as RawApiItem));

  let dynamicItems: RawApiItem[] = [];
  try {
    const { articleService } = await import("@/lib/services/article-service");
    const published = await articleService.listPublished({ limit: 50 });
    dynamicItems = published
      .filter((a) =>
        matchesNeedle(
          search,
          a.title,
          a.summary ?? "",
          (a.tags ?? []).join(" "),
          a.category ?? "",
        ),
      )
      .map((a) => ({
      type: "article",
      id: a.id,
      slug: a.slug,
      name: a.title,
      title: a.title,
      summary: a.summary ?? "",
      category: a.category ?? null,
      keywords: a.tags ?? [],
      href: `/articles/${a.author.slug}/${a.slug}`,
      author: a.author.name,
      authorAvatarUrl: a.author.avatarUrl,
      authorSlug: a.author.slug,
      // Author user id so the search ContentCard's EntityMedia rail can
      // mount with the correct owner + the create chip self-gates against
      // the authed viewer (gap #325).
      userId: a.author.id,
      readingTime: `${a.readMinutes} min`,
      createdAt: a.publishedAt ?? new Date().toISOString(),
      updatedAt: a.publishedAt ?? new Date().toISOString(),
      views: a.viewCount,
      isOfficial: false,
      coverImageUrl: a.coverImageUrl,
    } as RawApiItem));
  } catch {
    // Public articles fetch is best-effort; static blog still surfaces.
  }

  const merged = [...staticItems, ...dynamicItems].sort(
    (a, b) => new Date((b.createdAt as string) ?? 0).getTime() - new Date((a.createdAt as string) ?? 0).getTime(),
  );
  const start = Math.max(0, (page - 1) * limit);
  const items = merged.slice(start, start + limit).map((item) => ({ ...item, sortKey: toSortKey(item) }));
  return { items, total: merged.length };
}

async function fetchGuides(
  limit: number,
  page: number,
  search = "",
): Promise<TypedFetchResult> {
  // Static how-to pages curated for /help; merged into search so users never
  // have to know the difference between "help" and "search".
  const filtered = HELP_GUIDES.filter((g) =>
    matchesNeedle(search, g.title, g.description),
  );
  const start = Math.max(0, (page - 1) * limit);
  const baseTime = new Date("2026-01-01T00:00:00Z").getTime();
  const slice = filtered.slice(start, start + limit);
  const items = slice.map((guide, idx) => {
    const createdAt = new Date(baseTime - idx * 60_000).toISOString();
    const item: RawApiItem = {
      type: "guide",
      id: guide.link,
      name: guide.title,
      title: guide.title,
      summary: guide.description,
      href: guide.link,
      createdAt,
      views: 0,
    } as RawApiItem;
    return { ...item, sortKey: toSortKey(item) };
  });
  return { items, total: filtered.length };
}

async function fetchTools(
  limit: number,
  page: number,
  search = "",
): Promise<TypedFetchResult> {
  const filtered = TOOLS_CATALOG.filter((t) =>
    matchesNeedle(
      search,
      t.title,
      t.description,
      (t.features ?? []).join(" "),
      t.category,
      t.id,
    ),
  );
  const start = Math.max(0, (page - 1) * limit);
  const baseTime = new Date("2026-02-01T00:00:00Z").getTime();
  const slice = filtered.slice(start, start + limit);
  const items = slice.map((tool, idx) => {
    const createdAt = new Date(baseTime - idx * 60_000).toISOString();
    const item: RawApiItem = {
      type: "tool",
      id: tool.id,
      name: tool.title,
      title: tool.title,
      summary: tool.description,
      href: tool.href,
      tier: tool.tier,
      features: tool.features,
      createdAt,
      views: 0,
    } as RawApiItem;
    return { ...item, sortKey: toSortKey(item) };
  });
  return { items, total: filtered.length };
}

async function fetchFaqs(
  limit: number,
  page: number,
  search = "",
): Promise<TypedFetchResult> {
  // Flatten the categorised FAQ list so each Q&A becomes its own card and the
  // search layer can match against individual answers.
  const flat = HELP_FAQS.flatMap((cat) =>
    cat.questions.map((q) => ({ category: cat.category, ...q })),
  ).filter((q) => matchesNeedle(search, q.question, q.answer, q.category));
  const start = Math.max(0, (page - 1) * limit);
  const baseTime = new Date("2026-03-01T00:00:00Z").getTime();
  const slice = flat.slice(start, start + limit);
  const items = slice.map((faq, idx) => {
    const createdAt = new Date(baseTime - idx * 60_000).toISOString();
    const id = `faq-${start + idx}`;
    const item: RawApiItem = {
      type: "faq",
      id,
      name: faq.question,
      title: faq.question,
      summary: faq.answer,
      category: faq.category,
      href: `/help?q=${encodeURIComponent(faq.question)}`,
      createdAt,
      views: 0,
    } as RawApiItem;
    return { ...item, sortKey: toSortKey(item) };
  });
  return { items, total: flat.length };
}

async function fetchVideos(limit: number, page: number): Promise<TypedFetchResult> {
  // The studio endpoint returns a flat top-20 of recent public videos with
  // no server-side pagination, so we slice client-side. The discovery feed
  // wants the full set (SA-featured rows lead); the homepage hero has its
  // own dedicated `/videos/featured` feed for the curated carousel.
  try {
    const result = await studioService.getPublicVideos();
    const all = result.data ?? [];
    const start = Math.max(0, (page - 1) * limit);
    const slice = all.slice(start, start + limit);
    const items = slice.map((v: any) => {
      const item: RawApiItem = {
        type: "video",
        id: v.id,
        title: v.title,
        name: v.title,
        summary: v.description ?? "",
        description: v.description ?? "",
        thumbnail: v.thumbnailUrl ?? undefined,
        videoUrl: v.videoUrl ?? undefined,
        youtubeUrl: v.youtubeUrl ?? undefined,
        youtubeVideoId: v.youtubeVideoId ?? undefined,
        resumeId: v.resumeId ?? undefined,
        company: v.ownerName,
        views: 0,
        createdAt: v.createdAt,
      } as RawApiItem;
      return { ...item, sortKey: toSortKey(item) };
    });
    return { items, total: all.length };
  } catch (err) {
    console.error("card-feed: video fetch failed", err);
    return { items: [], total: 0 };
  }
}

async function fetchEvents(
  limit: number,
  page: number,
  geo?: CardFeedOptions["geo"],
): Promise<TypedFetchResult> {
  // Pulls upcoming public events via the events service (apiClient — same
  // auth/retry/error-suppression path as the other domain fetchers, and
  // mockable in tests). Inherits the same geo + radius filter the rest of
  // unified search uses; sort key is startAt (past events don't surface).
  try {
    const list = await eventsService.search({
      scope: "upcoming",
      limit,
      offset: Math.max(0, (page - 1) * limit),
      countryId: geo?.countryId,
      stateId: geo?.stateId,
      cityId: geo?.cityId,
      radiusKm: geo?.radiusKm,
    });
    const items = list.map((e: any) => {
      const item: RawApiItem = {
        type: "event",
        id: e.id,
        slug: e.slug ?? undefined,
        title: e.title,
        name: e.title,
        summary: e.description ?? "",
        description: e.description ?? "",
        thumbnail: e.coverImageUrl ?? undefined,
        category: e.category ?? undefined,
        eventFormat: e.eventFormat,
        location: e.location ?? undefined,
        startAt: e.startAt,
        endAt: e.endAt,
        attendeeCount: e.attendeeCount ?? 0,
        capacity: e.capacity ?? null,
        href: e.slug ? `/events/${e.slug}` : `/events/${e.id}`,
        // Sort by startAt — soonest first across the card-feed merge.
        createdAt: e.startAt,
        views: 0,
      } as RawApiItem;
      return { ...item, sortKey: toSortKey(item) };
    });
    return { items, total: list.length };
  } catch (err) {
    console.error("card-feed: event fetch failed", err);
    return { items: [], total: 0 };
  }
}

async function fetchPeople(limit: number, page: number): Promise<TypedFetchResult> {
  try {
    const result = await userService.getPublicUsers({ page, limit });
    const items = (result.items ?? []).map((p: any) => {
      // The backend toPublicUserCardDto already returns canonical field names
      // (type, fullName, firstName, lastName, avatar, etc.) — just spread and
      // add the sortKey / userId alias the card system expects.
      const item: RawApiItem = {
        ...p,
        userId: p.id,
        views: p.views ?? 0,
      };
      return { ...item, sortKey: toSortKey(item) };
    });
    return { items, total: (result as any).total ?? items.length };
  } catch (err) {
    console.error("card-feed: people fetch failed", err);
    return { items: [], total: 0 };
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
    geo,
  } = options;
  // Normalise the search query through the shared gate before fanning
  // out — sub-threshold inputs ("", "A") become the empty string here
  // so every downstream fetcher sees "no filter" without each one
  // re-implementing the length check.
  const search = effectiveSearchQuery(options.search);

  const tasks: Promise<TypedFetchResult>[] = [];
  if (types.includes("resume")) tasks.push(fetchResumes(limitPerType, page));
  if (types.includes("job")) tasks.push(fetchJobs(limitPerType, page, geo));
  if (types.includes("company")) tasks.push(fetchCompanies(limitPerType, page));
  if (types.includes("people")) tasks.push(fetchPeople(limitPerType, page));
  if (types.includes("video")) tasks.push(fetchVideos(limitPerType, page));
  if (types.includes("template")) tasks.push(fetchTemplates(limitPerType, page, search));
  if (types.includes("article")) tasks.push(fetchArticles(limitPerType, page, search));
  if (types.includes("guide")) tasks.push(fetchGuides(limitPerType, page, search));
  if (types.includes("tool")) tasks.push(fetchTools(limitPerType, page, search));
  if (types.includes("faq")) tasks.push(fetchFaqs(limitPerType, page, search));
  if (types.includes("event")) tasks.push(fetchEvents(limitPerType, page, geo));

  const results = await Promise.all(tasks);
  const merged = results.flatMap((r) => r.items);
  merged.sort((a, b) => compare(a, b, sort));

  // Sum per-domain totals so cross-domain pagination reflects reality rather
  // than the size of the current page's slice.
  const total = results.reduce((acc, r) => acc + r.total, 0);
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
