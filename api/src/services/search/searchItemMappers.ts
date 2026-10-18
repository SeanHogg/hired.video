/**
 * Row → unified-search item mappers for `GET /api/search/public`.
 *
 * Pure (type-only row imports, no DB / env access) so the response
 * shape of every kind is unit-testable. The shapes are a public contract:
 * the frontend card layer and the Resource Map read these exact fields.
 */

import type {
  ArticleSearchRow,
  CompanySearchRow,
  CourseSearchRow,
  MediaSearchVideoRow,
  PeopleSearchProfileRow,
  PeopleSearchUserRow,
  ScheduledEventRow,
  TemplateSearchRow,
  VoiceSearchRow,
} from "../../repositories/publicSearchRepository.js";
import type { ResumeRow } from "../../repositories/resumeRepository.js";
import type { JobEntity } from "../job/job-entity.js";

export function toSearchItem(job: JobEntity) {
  return {
    id: job.id,
    type: "job" as const,
    title: job.title,
    description: job.description,
    company: job.company,
    location: job.location,
    postedDate: job.postedDate,
    createdAt: job.createdAt,
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel,
    salary: job.salaryMin !== undefined && job.salaryMax !== undefined ? `${job.salaryMin}-${job.salaryMax}` : undefined,
    isFeatured: false,
  };
}

export function toCompanyItem(company: CompanySearchRow) {
  const hq = company.headquarters;
  const location = hq
    ? [hq.city, hq.state, hq.country].filter(Boolean).join(", ") || hq.address || null
    : null;
  return {
    id: company.id,
    type: "company" as const,
    title: company.name,
    name: company.name,
    description: company.description,
    industry: company.industry,
    location,
    logo: company.logoUrl,
    size: company.size,
    founded: company.foundedYear ?? undefined,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

export function toPeopleItem(user: PeopleSearchUserRow, profile?: PeopleSearchProfileRow | null) {
  return {
    id: user.id,
    type: "people" as const,
    name: user.name,
    role: user.role,
    avatar: profile?.avatarUrl ?? undefined,
    headline: profile?.headline ?? undefined,
    location: profile?.location ?? undefined,
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString(),
  };
}

export function toResumeItem(resume: ResumeRow) {
  return {
    id: resume.id,
    type: "resume" as const,
    title: resume.title,
    // privacyLevel: 0=public, 1=recruiter-only, 2=connections, 10=private.
    // The search endpoint is anonymous, so anything returned here is public by definition.
    isPublic: resume.privacyLevel === 0,
    privacyLevel: resume.privacyLevel,
    templateName: "Default",
    createdAt: resume.createdAt.toISOString(),
    updatedAt: resume.updatedAt.toISOString(),
  };
}

export function toVoiceItem(clone: VoiceSearchRow) {
  // Voice clone listings appear in the homepage media catalog as type "voice".
  // The cart consumes priceCents directly via the embedded `voice` field.
  return {
    id: clone.id,
    type: "voice" as const,
    title: clone.name,
    name: clone.name,
    description: clone.description ?? "",
    summary: clone.description ?? "",
    createdAt: clone.createdAt.toISOString(),
    updatedAt: clone.updatedAt.toISOString(),
    voice: {
      id: clone.id,
      previewAudioUrl: clone.previewAudioUrl ?? null,
      priceCents: clone.priceCents,
      currency: clone.currency,
      language: clone.language ?? null,
      gender: clone.gender ?? null,
      accent: clone.accent ?? null,
      listingSlug: clone.listingSlug ?? null,
      creatorId: clone.userId,
      playCount: clone.playCount,
      purchaseCount: clone.purchaseCount,
    },
  };
}

export function toTemplateItem(t: TemplateSearchRow, hvCommunityCompanyId: string | null) {
  // Marketplace card payload. The cart consumes priceCents directly via the
  // embedded `template` field, mirroring how voice clones expose `voice`.
  // `firstParty` flags templates owned by the Hired.VIDEO Community company
  // so the marketplace can render a platform-shipped badge / filter pill.
  const firstParty = Boolean(
    t.companyId && hvCommunityCompanyId && t.companyId === hvCommunityCompanyId,
  );
  return {
    id: t.id,
    type: "template" as const,
    title: t.name,
    name: t.name,
    description: t.description ?? "",
    summary: t.description ?? "",
    avatar: t.thumbnailUrl ?? undefined,
    // What the template makes — output axis + (for documents) which
    // document. Cards label the kind via shared/template-kinds.ts.
    mediaKind: t.mediaKind,
    documentKind: t.documentKind ?? null,
    createdAt: (t.publishedAt ?? t.createdAt).toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    isFeatured: firstParty,
    template: {
      kind: "studio" as const,
      id: t.id,
      slug: t.listingSlug ?? null,
      thumbnailUrl: t.thumbnailUrl ?? null,
      previewVideoUrl: t.previewVideoUrl ?? null,
      priceCents: t.priceCents,
      currency: t.currency,
      durationSec: t.durationSec ?? null,
      motion: t.motion ?? null,
      language: t.language ?? null,
      tags: (t.tags as string[]) ?? [],
      creatorId: t.creatorId,
      companyId: t.companyId ?? null,
      firstParty,
      viewCount: t.viewCount,
      purchaseCount: t.purchaseCount,
    },
  };
}

export function toArticleItem(a: ArticleSearchRow) {
  // Articles surface in the unified results so location-tagged creator
  // content shows up alongside jobs / videos / services for viewers in
  // the same region. Only `published` articles ever reach here (filter
  // applied at query time).
  return {
    id: a.id,
    type: "article" as const,
    title: a.title,
    description: a.summary ?? "",
    summary: a.summary ?? "",
    avatar: a.coverImageUrl ?? undefined,
    category: a.category ?? undefined,
    kind: a.kind,
    readMinutes: a.readMinutes,
    // Author id so the search card can self-gate the create-EntityMedia
    // chip + show the EntityMedia rail with the correct owner (gap #325).
    userId: a.userId ?? undefined,
    createdAt: (a.publishedAt ?? a.createdAt).toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    isFeatured: false,
  };
}

export function toLearningPathItem(course: CourseSearchRow) {
  // Published LMS courses surface under the `learning_path` kind so the
  // Resource Map's "Learning paths" bucket can populate (#1667). The kind
  // discriminator is `learning_path` to match content_audiences tags +
  // CONTENT_LOCATION_KINDS; the card layer routes it to /courses/:id.
  return {
    id: course.id,
    type: "learning_path" as const,
    title: course.title,
    description: course.summary ?? "",
    summary: course.summary ?? "",
    avatar: course.coverImageUrl ?? undefined,
    category: course.category ?? undefined,
    difficulty: course.difficulty ?? undefined,
    estimatedMinutes: course.estimatedMinutes ?? undefined,
    createdAt: (course.publishedAt ?? course.createdAt).toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    isFeatured: false,
  };
}

export function toMediaItem(video: MediaSearchVideoRow, ownerName: string | null) {
  const title = video.title || `${ownerName ?? "Unknown"}'s Video Resume`;
  return {
    id: video.id,
    type: "media" as const,
    title,
    name: title,
    description: video.description ?? "",
    summary: video.description ?? "Video Resume",
    // Frontend media mapper reads these overloaded fields:
    skills: "video",           // metaType
    location: video.userId,    // ownerId
    company: video.resumeId,   // resumeId reference
    experienceLevel: video.youtubeUrl ?? (video.r2Key ? `/cdn/${video.r2Key}` : null), // mediaUrl
    avatar: video.thumbnailUrl, // thumbnail
    createdAt: video.createdAt.toISOString(),
    isFeatured: false,
  };
}

export function toEventItem(ev: ScheduledEventRow) {
  return {
    id: ev.id,
    type: "event" as const,
    title: ev.title,
    description: ev.description,
    slug: ev.slug,
    coverImageUrl: ev.coverImageUrl,
    category: ev.category,
    eventFormat: ev.eventFormat,
    startAt: ev.startAt.toISOString(),
    endAt: ev.endAt.toISOString(),
    location: ev.location,
    attendeeCount: ev.attendeeCount,
    capacity: ev.capacity,
    isFeatured: false,
    // Unified-search sort uses createdAt; for events we want sort by start
    // time, but the global merge order keys on createdAt — so we expose
    // both. The FE EventResultCard already keys its tile by startAt.
    createdAt: (ev.publishedAt ?? ev.createdAt).toISOString(),
  };
}

export type PublicSearchItem =
  | ReturnType<typeof toSearchItem>
  | ReturnType<typeof toCompanyItem>
  | ReturnType<typeof toPeopleItem>
  | ReturnType<typeof toResumeItem>
  | ReturnType<typeof toVoiceItem>
  | ReturnType<typeof toTemplateItem>
  | ReturnType<typeof toMediaItem>
  | ReturnType<typeof toArticleItem>
  | ReturnType<typeof toEventItem>
  | ReturnType<typeof toLearningPathItem>;
