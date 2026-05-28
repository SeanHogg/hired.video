import { Hono } from "hono";
import { and, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { getPublicJobs, getHiredVideoCommunityCompanyId, JobEntity } from "../services/job/JobService.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { buildApiDeps } from "../services/apiDeps.js";
import { LocationService } from "../services/location/LocationService.js";
import { AudienceService } from "../services/audience/AudienceService.js";
import type { ContentLocationKind, LocationFilter } from "../../../shared/content-locations.js";
import { AudienceKeySchema, type AudienceKey } from "../../../shared/audiences.js";
import { NON_CANDIDATE_ROLES } from "../../../shared/user-roles.js";

const { companyProfiles, users, userProfiles, resumeInformation, studioVoiceClones, studioTemplates, videos, articles, scheduledEvents, courses } = schema;

export const searchRoutes = new Hono<AppEnv>();

function toSearchItem(job: JobEntity) {
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

function toCompanyItem(company: typeof companyProfiles.$inferSelect) {
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

function toPeopleItem(user: typeof users.$inferSelect, profile?: typeof userProfiles.$inferSelect | null) {
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

function toResumeItem(resume: typeof resumeInformation.$inferSelect) {
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

function toVoiceItem(clone: typeof studioVoiceClones.$inferSelect) {
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

function toTemplateItem(
  t: typeof studioTemplates.$inferSelect,
  hvCommunityCompanyId: string | null,
) {
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

function toArticleItem(a: typeof articles.$inferSelect) {
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
    createdAt: (a.publishedAt ?? a.createdAt).toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    isFeatured: false,
  };
}

function toLearningPathItem(course: typeof courses.$inferSelect) {
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

function toMediaItem(video: typeof videos.$inferSelect, ownerName: string | null) {
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

function toEventItem(ev: typeof scheduledEvents.$inferSelect) {
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

// Unified search endpoint used by frontend.
// Supports category filtering (jobs/people/companies/resumes) and a default "all".
searchRoutes.get("/public", async (c) => {
  const search = String(c.req.query("search") ?? "").trim();
  const category = String(c.req.query("category") ?? "all").toLowerCase();
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const location = String(c.req.query("location") ?? "").trim();
  const employmentType = c.req.query("employmentType") || undefined;
  const experienceLevel = c.req.query("experienceLevel") || undefined;
  const isRemoteParam = c.req.query("isRemote");
  const isRemote = isRemoteParam === "true" ? true : isRemoteParam === "false" ? false : undefined;
  const salaryMin = c.req.query("salaryMin") ? Number(c.req.query("salaryMin")) : undefined;
  const salaryMax = c.req.query("salaryMax") ? Number(c.req.query("salaryMax")) : undefined;

  const includeJobs = category === "all" || category === "jobs";
  const includeCompanies = category === "all" || category === "companies";
  const includePeople = category === "all" || category === "people";
  // `templates` is a UNION view across template-shaped surfaces — public
  // resumes (which today double as resume templates, no isTemplate flag
  // on the schema) AND studio templates. Per #1613, the original bug was
  // that `category=templates` returned only `studio_templates` rows. The
  // frontend categoryToTypes("templates") matches by emitting both
  // "template" + "resume" card types under the templates category.
  const includeResumes = category === "all" || category === "resumes" || category === "templates";
  const includeVoices = category === "all" || category === "voices";
  const includeMedia = category === "all" || category === "media";
  const includeTemplates = category === "all" || category === "templates";
  const includeArticles = category === "all" || category === "articles";
  const includeEvents = category === "all" || category === "events";
  const includeLearningPaths = category === "all" || category === "learning_paths";

  // Audience filter — orthogonal to geo. When set, every kind's
  // candidate set is intersected with the entity_ids tagged with this
  // audience key in content_audiences. Per #1616 / Resource Maps.
  const audienceParam = c.req.query("audience");
  const audienceParsed = audienceParam
    ? AudienceKeySchema.safeParse(audienceParam)
    : null;
  const audienceKey: AudienceKey | null = audienceParsed?.success
    ? audienceParsed.data
    : null;

  // Structured geo filter — every kind shares one LocationService call
  // per kind to translate the filter into an entity_id allowlist.
  // Free-text `location` continues to work as a fallback for callers
  // that haven't migrated their UI to the picker.
  const geoFilter: LocationFilter = {
    countryId: c.req.query("countryId") ? Number(c.req.query("countryId")) : undefined,
    stateId: c.req.query("stateId") || undefined,
    cityId: c.req.query("cityId") || undefined,
    latitude: c.req.query("lat") ? Number(c.req.query("lat")) : undefined,
    longitude: c.req.query("lng") ? Number(c.req.query("lng")) : undefined,
    radiusKm: c.req.query("radiusKm") ? Number(c.req.query("radiusKm")) : undefined,
    remote: isRemote,
    text: location || undefined,
  };
  const hasStructuredGeo =
    geoFilter.countryId != null ||
    geoFilter.stateId != null ||
    geoFilter.cityId != null ||
    (geoFilter.latitude != null && geoFilter.longitude != null);
  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const deps = buildApiDeps(env);
  const locationService = new LocationService(deps);
  const audienceService = new AudienceService({ db: getDb() });

  /** Intersect two allowlists, preserving "null = no filter" semantics:
   *    - both null → null (no constraint)
   *    - one null  → return the other (single filter applied)
   *    - both set  → set intersection (empty array = short-circuit) */
  const intersectAllowlists = (
    a: string[] | null,
    b: string[] | null,
  ): string[] | null => {
    if (a === null && b === null) return null;
    if (a === null) return b;
    if (b === null) return a;
    if (a.length === 0 || b.length === 0) return [];
    const setB = new Set(b);
    return a.filter((id) => setB.has(id));
  };

  /** Resolve the allowlist for one entity_kind. Layers geo + audience
   *  filters (each independent); returns null when neither filter is set
   *  OR the kind is excluded by category. */
  const allowlistFor = async (
    kind: ContentLocationKind,
    enabled: boolean,
  ): Promise<string[] | null> => {
    if (!enabled) return null;
    const [geoAllow, audienceAllow] = await Promise.all([
      hasStructuredGeo
        ? locationService.applyLocationFilter(kind, geoFilter)
        : Promise.resolve(null),
      audienceService.applyAudienceFilter(kind, audienceKey),
    ]);
    return intersectAllowlists(geoAllow, audienceAllow);
  };

  const [
    jobsAllow,
    peopleAllow,
    resumesAllow,
    voicesAllow,
    templatesAllow,
    mediaAllow,
    articlesAllow,
    companiesAllow,
    eventsAllow,
    learningPathsAllow,
  ] = await Promise.all([
    allowlistFor("job", includeJobs),
    allowlistFor("user_profile", includePeople),
    allowlistFor("resume", includeResumes),
    allowlistFor("voice", includeVoices),
    allowlistFor("template", includeTemplates),
    allowlistFor("video", includeMedia),
    allowlistFor("article", includeArticles),
    allowlistFor("company", includeCompanies),
    allowlistFor("event", includeEvents),
    allowlistFor("learning_path", includeLearningPaths),
  ]);

  const jobsPromise = includeJobs
    ? getPublicJobs({
        page: 1,
        limit: 100,
        search: search || undefined,
        location: location || undefined,
        employmentType,
        experienceLevel,
        isRemote,
        salaryMin,
        salaryMax,
        entityIdAllowlist: jobsAllow,
      })
    : Promise.resolve({ items: [], total: 0, page: 1, limit: 0, totalPages: 0, hasNext: false, hasPrev: false });

  const db = getDb();

  /** True when an allowlist was applied but matched zero entities —
   *  short-circuit the corresponding query. */
  const allowEmpty = (allow: string[] | null) => allow !== null && allow.length === 0;

  /** Returns a drizzle expression that intersects the candidate column
   *  with the allowlist when set, or `undefined` when no filter. */
  const allowClause = <T>(col: T, allow: string[] | null) =>
    allow !== null && allow.length > 0 ? inArray(col as any, allow) : undefined;

  // Companies: only list active profiles (soft-delete / hidden companies stay out).
  const companyActiveClause = eq(companyProfiles.isActive, true);
  const companyWhereParts = [companyActiveClause];
  if (search) {
    companyWhereParts.push(
      or(ilike(companyProfiles.name, `%${search}%`), ilike(companyProfiles.description, `%${search}%`))!,
    );
  }
  const compAllow = allowClause(companyProfiles.id, companiesAllow);
  if (compAllow) companyWhereParts.push(compAllow);
  const companyPromise = includeCompanies && !allowEmpty(companiesAllow)
    ? db
        .select()
        .from(companyProfiles)
        .where(and(...companyWhereParts))
        .orderBy(desc(companyProfiles.createdAt))
        .limit(100)
    : Promise.resolve([] as typeof companyProfiles.$inferSelect[]);

  // People: only list users whose profileVisibility is "public" AND whose email
  // is verified. Users without a profile row are excluded because profile is
  // required to enforce visibility. The emailVerified gate keeps unverified
  // signups (a common spam vector) out of the public directory until they prove
  // ownership of the email address.
  const peopleVisibilityClause = and(
    eq(userProfiles.profileVisibility, "public"),
    eq(users.emailVerified, true),
    // Exclude workforce members + platform staff from candidate search.
    // Same SSoT used by /api/users/public (#1407, DRY rule).
    notInArray(users.role, NON_CANDIDATE_ROLES as unknown as string[]),
    // Confidential search mode (#1627) — fail-closed exclusion from the
    // anonymous public directory for execs who can't be seen job-hunting.
    eq(userProfiles.confidentialMode, false),
  );
  const peopleWhereParts: any[] = [peopleVisibilityClause];
  if (search) {
    peopleWhereParts.push(
      or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))!,
    );
  }
  // user_profile content_locations key on user_id (= users.id), matching
  // how we backfilled user_profiles.user_id in migration 0109.
  const peopleAllowCl = allowClause(users.id, peopleAllow);
  if (peopleAllowCl) peopleWhereParts.push(peopleAllowCl);
  const peoplePromise = includePeople && !allowEmpty(peopleAllow)
    ? db
        .select({ user: users, profile: userProfiles })
        .from(users)
        .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(and(...peopleWhereParts))
        .orderBy(desc(users.createdAt))
        .limit(100)
    : Promise.resolve([] as Array<{ user: typeof users.$inferSelect; profile: typeof userProfiles.$inferSelect | null }>);

  // Resumes: ONLY return resumes with privacyLevel=0 (public). Everything else
  // (recruiter-only, connections, private, draft) must be invisible on the public
  // search surface — this endpoint is anonymous. Goes through
  // ResumeRepository.searchPublicByTitle so resume-table access stays at
  // one seam; the repo enforces the privacy filter internally.
  const resumesPromise = includeResumes && !allowEmpty(resumesAllow)
    ? buildRepos(db)
        .resumes.searchPublicByTitle(search ?? "", 100)
        .then((rows) => {
          if (!resumesAllow || resumesAllow.length === 0) return rows;
          const allow = new Set(resumesAllow);
          return rows.filter((r) => allow.has(r.id));
        })
    : Promise.resolve([] as typeof resumeInformation.$inferSelect[]);

  // Voice marketplace listings — only public clones; rank by recency.
  const voicesWhereParts: any[] = [eq(studioVoiceClones.visibility, "public")];
  if (search) {
    voicesWhereParts.push(
      or(
        ilike(studioVoiceClones.name, `%${search}%`),
        ilike(studioVoiceClones.description, `%${search}%`),
      )!,
    );
  }
  const voicesAllowCl = allowClause(studioVoiceClones.id, voicesAllow);
  if (voicesAllowCl) voicesWhereParts.push(voicesAllowCl);
  const voicesPromise = includeVoices && !allowEmpty(voicesAllow)
    ? db
        .select()
        .from(studioVoiceClones)
        .where(and(...voicesWhereParts))
        .orderBy(desc(studioVoiceClones.createdAt))
        .limit(100)
    : Promise.resolve([] as typeof studioVoiceClones.$inferSelect[]);

  // Studio template marketplace listings — only public templates; rank by
  // most recently published. Mirrors the voice clone path above.
  // `?firstParty=true` narrows to templates owned by the Hired.VIDEO
  // Community company (platform-shipped). The flag is also surfaced on
  // every template item via toTemplateItem so the frontend can render a
  // badge without needing a second round-trip.
  const firstPartyOnly = c.req.query("firstParty") === "true";
  const hvCommunityCompanyId = await getHiredVideoCommunityCompanyId();
  const templatesWhereParts = [eq(studioTemplates.visibility, "public")];
  if (search) {
    templatesWhereParts.push(or(
      ilike(studioTemplates.name, `%${search}%`),
      ilike(studioTemplates.description, `%${search}%`),
    )!);
  }
  if (firstPartyOnly && hvCommunityCompanyId) {
    templatesWhereParts.push(eq(studioTemplates.companyId, hvCommunityCompanyId));
  }
  const templatesAllowCl = allowClause(studioTemplates.id, templatesAllow);
  if (templatesAllowCl) templatesWhereParts.push(templatesAllowCl);
  const templatesWhere = templatesWhereParts.length === 1 ? templatesWhereParts[0] : and(...templatesWhereParts);
  const templatesPromise = includeTemplates && !allowEmpty(templatesAllow)
    ? db
        .select()
        .from(studioTemplates)
        .where(templatesWhere)
        .orderBy(desc(studioTemplates.publishedAt))
        .limit(100)
    : Promise.resolve([] as typeof studioTemplates.$inferSelect[]);

  // Media (public video resumes)
  const mediaWhereParts: any[] = [eq(videos.privacyStatus, "public")];
  if (search) {
    mediaWhereParts.push(
      or(ilike(videos.title, `%${search}%`), ilike(videos.description, `%${search}%`))!,
    );
  }
  const mediaAllowCl = allowClause(videos.id, mediaAllow);
  if (mediaAllowCl) mediaWhereParts.push(mediaAllowCl);
  const mediaPromise = includeMedia && !allowEmpty(mediaAllow)
    ? db
        .select({ video: videos, ownerName: users.name })
        .from(videos)
        .innerJoin(users, eq(videos.userId, users.id))
        .where(and(...mediaWhereParts))
        .orderBy(desc(videos.createdAt))
        .limit(100)
    : Promise.resolve([] as Array<{ video: typeof videos.$inferSelect; ownerName: string | null }>);

  // Articles — creator-authored published articles. New in this pass:
  // were previously not in unified search at all (Gap Register hole).
  const articlesWhereParts: any[] = [eq(articles.status, "published")];
  if (search) {
    articlesWhereParts.push(
      or(
        ilike(articles.title, `%${search}%`),
        ilike(articles.summary, `%${search}%`),
      )!,
    );
  }
  const articlesAllowCl = allowClause(articles.id, articlesAllow);
  if (articlesAllowCl) articlesWhereParts.push(articlesAllowCl);
  const articlesPromise = includeArticles && !allowEmpty(articlesAllow)
    ? db
        .select()
        .from(articles)
        .where(and(...articlesWhereParts))
        .orderBy(desc(articles.publishedAt))
        .limit(100)
    : Promise.resolve([] as typeof articles.$inferSelect[]);

  // Learning paths — published LMS courses (#1667). Surfaces under the
  // `learning_path` kind so the Resource Map bucket + audience filter
  // work; mirrors the articles path (status gate + search + allowlist).
  const learningPathsWhereParts: any[] = [eq(courses.status, "published")];
  if (search) {
    learningPathsWhereParts.push(
      or(
        ilike(courses.title, `%${search}%`),
        ilike(courses.summary, `%${search}%`),
      )!,
    );
  }
  const learningPathsAllowCl = allowClause(courses.id, learningPathsAllow);
  if (learningPathsAllowCl) learningPathsWhereParts.push(learningPathsAllowCl);
  const learningPathsPromise = includeLearningPaths && !allowEmpty(learningPathsAllow)
    ? db
        .select()
        .from(courses)
        .where(and(...learningPathsWhereParts))
        .orderBy(desc(courses.publishedAt))
        .limit(100)
    : Promise.resolve([] as typeof courses.$inferSelect[]);

  // Events — public, non-cancelled, upcoming (or matching the geo/text filter).
  // Discovery surface only: `visibility='public'` + `type IN ('event','coffee')`.
  // Cancelled events stay out of search.
  const eventsWhereParts: any[] = [
    eq(scheduledEvents.visibility, "public"),
    inArray(scheduledEvents.type, ["event", "coffee"]),
    sql`${scheduledEvents.cancelledAt} IS NULL`,
  ];
  if (search) {
    eventsWhereParts.push(
      or(
        ilike(scheduledEvents.title, `%${search}%`),
        ilike(scheduledEvents.description, `%${search}%`),
      )!,
    );
  }
  const eventsAllowCl = allowClause(scheduledEvents.id, eventsAllow);
  if (eventsAllowCl) eventsWhereParts.push(eventsAllowCl);
  const eventsPromise = includeEvents && !allowEmpty(eventsAllow)
    ? db
        .select()
        .from(scheduledEvents)
        .where(and(...eventsWhereParts))
        .orderBy(scheduledEvents.startAt)
        .limit(100)
    : Promise.resolve([] as typeof scheduledEvents.$inferSelect[]);

  const [jobs, companies, people, resumes, voices, templates, media, articlesList, events, learningPaths] = await Promise.all([
    jobsPromise,
    companyPromise,
    peoplePromise,
    resumesPromise,
    voicesPromise,
    templatesPromise,
    mediaPromise,
    articlesPromise,
    eventsPromise,
    learningPathsPromise,
  ]);

  // When searching "all", we merge and paginate by createdAt.
  const items = [
    ...jobs.items.map(toSearchItem),
    ...companies.map(toCompanyItem),
    ...people.map(({ user, profile }) => toPeopleItem(user, profile ?? null)),
    ...resumes.map(toResumeItem),
    ...voices.map(toVoiceItem),
    ...templates.map((t) => toTemplateItem(t, hvCommunityCompanyId)),
    ...media.map(({ video, ownerName }) => toMediaItem(video, ownerName)),
    ...articlesList.map(toArticleItem),
    ...events.map(toEventItem),
    ...learningPaths.map(toLearningPathItem),
  ]
    .sort((a, b) => (new Date(b.createdAt).getTime() ?? 0) - (new Date(a.createdAt).getTime() ?? 0));

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const pagedItems = items.slice(start, start + limit);

  return c.json(
    success({
      items: pagedItems,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    }),
    200,
  );
});

// ─── Boolean / Advanced Recruiter Search ─────────────────────────────────────
// POST /api/search/recruiter
// Supports: Boolean operators (AND / OR / NOT), quoted phrases, skill filters,
// experience level, location, and saved-search CRUD.
//
// Boolean string examples:
//   "React AND TypeScript"
//   "Python OR Django NOT intern"
//   "(product manager OR PM) AND SaaS"

const { savedSearches } = schema as any;

/** Convert a human-written Boolean string into a PostgreSQL tsquery expression. */
function booleanToTsquery(input: string): string {
  // Normalise whitespace
  let q = input.trim();
  if (!q) return "";

  // Quoted phrases → phrase tokens for pg to_tsquery
  q = q.replace(/"([^"]+)"/g, (_m, phrase) => phrase.trim().split(/\s+/).join(" <-> "));

  // Boolean operators
  q = q
    .replace(/\bAND\b/g, " & ")
    .replace(/\bOR\b/g, " | ")
    .replace(/\bNOT\b/g, " !")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Wrap bare words with wildcards (prefix matching)
  q = q.replace(/\b([a-zA-Z0-9_]+)\b(?!\s*[:|&!])/g, "$1:*");

  return q;
}

const RecruiterSearchSchema = z.object({
  query: z.string().max(500).default(""),
  skills: z.array(z.string()).default([]),
  location: z.string().max(200).optional(),
  // Structured geo filter — viewer-side. Same shape as LocationFilter in
  // shared/content-locations.ts but spelled inline for the request body.
  countryId: z.number().int().positive().optional(),
  stateId: UuidLikeSchema.optional(),
  cityId: UuidLikeSchema.optional(),
  radiusKm: z.number().int().positive().max(20000).optional(),
  experienceLevel: z.enum(["entry", "mid", "senior", "lead", "executive"]).optional(),
  role: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

searchRoutes.post("/recruiter", async (c) => {
  const userId = c.var.user?.sub;
  const body = await c.req.json().catch(() => ({}));
  const parsed = RecruiterSearchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR" } }, 400);

  const { query, skills, location, experienceLevel, countryId, stateId, cityId, radiusKm, page, limit } = parsed.data;
  const offset = (page - 1) * limit;
  const db = getDb();

  // Build WHERE conditions
  const conditions: ReturnType<typeof sql>[] = [];

  // Structured geo filter — resolved once via LocationService against
  // user_profile content_locations rows (back-populated by migration 0109
  // from user_profiles.location). When no structured filter is set we
  // still honor the free-text `location` fallback below.
  const hasGeo = countryId != null || stateId != null || cityId != null;
  if (hasGeo) {
    const env = (c.env ?? {}) as Record<string, string | undefined>;
    const deps = buildApiDeps(env);
    const svc = new LocationService(deps);
    const allow = await svc.applyLocationFilter("user_profile", {
      countryId,
      stateId,
      cityId,
      radiusKm,
    });
    if (allow !== null) {
      if (allow.length === 0) {
        return c.json(
          success({ candidates: [], total: 0, page, limit, totalPages: 1, hasNextPage: false }),
          200,
        );
      }
      conditions.push(inArray(users.id, allow));
    }
  }

  if (query.trim()) {
    const tsQuery = booleanToTsquery(query);
    if (tsQuery) {
      conditions.push(sql`
        to_tsvector('english', coalesce(${users.name}, '') || ' ' ||
          coalesce((SELECT string_agg(coalesce(e->>'title','') || ' ' || coalesce(e->>'company',''), ' ')
                    FROM jsonb_array_elements(coalesce((SELECT work_experience FROM user_profiles WHERE user_id = ${users.id}), '[]'::jsonb)) e), ''))
        @@ to_tsquery('english', ${tsQuery})
      `);
    }
  }

  if (skills.length > 0) {
    for (const skill of skills) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(
          (SELECT skills FROM user_profiles WHERE user_id = ${users.id}), '[]'::jsonb)
        ) s WHERE lower(s) LIKE ${"%" + skill.toLowerCase() + "%"}
      )`);
    }
  }

  if (location && !hasGeo) {
    // Legacy free-text fallback — only when no structured geo was set,
    // so a viewer who picks a city in the LocationFilter doesn't also
    // get noise from a stale free-text string.
    conditions.push(ilike(userProfiles.location, `%${location}%`));
  }

  // Confidential employer blocklist (#1679) — exclude any candidate whose
  // confidential_blocklist names the VIEWING recruiter's own company.
  // Resolved from the viewer's profile.current_company; case-insensitive.
  if (userId) {
    const [viewer] = await db
      .select({ company: userProfiles.currentCompany })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    const viewerCompany = (viewer?.company ?? "").trim();
    if (viewerCompany) {
      conditions.push(sql`NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(
          (SELECT confidential_blocklist FROM user_profiles WHERE user_id = ${users.id}), '[]'::jsonb)
        ) b WHERE lower(b) = lower(${viewerCompany})
      )`);
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRows, candidateRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).where(whereClause),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        headline: userProfiles.headline,
        location: userProfiles.location,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const total = countRows[0]?.count ?? 0;
  return c.json(
    success({
      candidates: candidateRows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNextPage: offset + limit < total,
    }),
    200,
  );
});

// ─── Saved Searches ──────────────────────────────────────────────────────────
// GET  /api/search/saved       — list user's saved searches
// POST /api/search/saved       — save a search
// DELETE /api/search/saved/:id — delete

const SavedSearchSchema = z.object({
  name: z.string().min(1).max(100),
  query: z.string().max(500),
  filters: z.record(z.string(), z.any()).default({}),
  searchType: z.enum(["recruiter", "jobs", "people", "companies"]).default("recruiter"),
});

searchRoutes.get("/saved", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
  const db = getDb();

  if (!savedSearches) {
    return c.json(success([]), 200);
  }

  const rows = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(desc(savedSearches.createdAt));

  return c.json(success(rows), 200);
});

searchRoutes.post("/saved", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = SavedSearchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: { code: "VALIDATION_ERROR" } }, 400);

  // Closes gap-register #766: enforce Free-tier 3-saved-search cap that was
  // previously marketing-only on the Pricing page.
  const blocked = await servicesProcessor.enforce(c, "saved_search");
  if (blocked) return blocked;

  const db = getDb();

  if (!savedSearches) {
    // Schema not yet migrated — return the data as-is
    return c.json(success({ id: crypto.randomUUID(), userId, ...parsed.data, createdAt: new Date().toISOString() }), 201);
  }

  const [row] = (await db
    .insert(savedSearches)
    .values({ userId, ...parsed.data } as any)
    .returning()) as any[];

  servicesProcessor.meterEvent(c, "saved_search", { id: row?.id });

  // Gamification award. Saved-search creation is the strongest "active
  // job-hunting" signal we have today; the deeper "saved search delivered
  // new jobs" event requires a dedicated runner (see gap register).
  const { withGamification } = await import("../domains/gamification/with-gamification.js");
  await withGamification(c, "saved-search-create", (game, role, uid) =>
    game.onSavedSearchRun({ userId: uid, role, runId: row?.id ?? crypto.randomUUID() }),
  );

  return c.json(success(row), 201);
});

searchRoutes.delete("/saved/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
  const id = c.req.param("id");
  const db = getDb();

  if (!savedSearches) return c.json(success(true), 200);

  await db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
  return c.json(success(true), 200);
});

// Fallback for other search routes (not implemented)
searchRoutes.all("*", (c) =>
  c.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Search routes coming soon" } },
    501,
  ),
);
