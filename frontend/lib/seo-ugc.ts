/**
 * UGC SEO — single abstraction that every user-generated-content
 * detail page plugs into.
 *
 * Why it exists
 * -------------
 * Before this module, every UGC page (jobs, companies, profiles, resumes,
 * articles, blog posts, video resumes, marketplace listings, share tokens)
 * hand-rolled its own `useSEO({...})` call. The result: drift, missing
 * `ogImage` on most surfaces, missing `keywords`, an `ArticleView` that
 * passed the wrong route key, manual `setMeta()` calls bypassing the
 * platform default merge, and one whole content type (ResumeDetail) that
 * shipped with zero per-record SEO at all.
 *
 * The contract
 * ------------
 *  1. Each content type has a `UgcKind` slug ("person", "job", ...).
 *  2. Each kind owns one `UgcSeoAdapter<R>` — a pure function that
 *     converts the loaded record into an `SEOData` payload (title,
 *     description, ogImage, keywords, structuredData, robots, ...).
 *  3. Pages call `useUgcSeo(kind, record)`. No more inline title/desc/JSON-LD
 *     construction on the page. No more `useSEO(pathname, customData)`
 *     boilerplate.
 *
 * Adding a new content type
 * -------------------------
 *  1. Define the input record shape (a single TS type).
 *  2. Write a builder function `(record): SEOData | null` and
 *     register it via `registerUgcSeo("yourKind", builder)`.
 *  3. Call `useUgcSeo("yourKind", record)` from the page.
 *
 * If the page renders before its record is loaded, pass `null` /
 * `undefined` — the hook no-ops cleanly and falls back to the platform
 * defaults via `useSEO`.
 */

import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { generateStructuredData, useSEO, type SEOData } from "./seo";
import { buildImageUrl } from "./utils";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type UgcKind =
  | "person"
  | "company"
  | "job"
  | "resume"
  | "article"
  | "blogPost"
  | "videoResume"
  | "templateListing"
  | "voiceClone"
  | "course"
  | "channel"
  | "shareToken"
  | "companyReviews";

export type UgcSeoBuilder<R> = (record: R, pathname: string) => SEOData | null;

const REGISTRY: Partial<Record<UgcKind, UgcSeoBuilder<any>>> = {};

export function registerUgcSeo<R>(kind: UgcKind, builder: UgcSeoBuilder<R>): void {
  REGISTRY[kind] = builder;
}

/**
 * Single hook that every UGC detail page calls. The kind tag picks
 * the adapter; the record is the loaded entity. Passing `null` /
 * `undefined` is a no-op (page falls back to platform default SEO).
 */
export function useUgcSeo<R>(kind: UgcKind, record: R | null | undefined): void {
  const location = useLocation();
  const seo = useMemo<SEOData>(() => {
    if (!record) return {};
    const build = REGISTRY[kind] as UgcSeoBuilder<R> | undefined;
    if (!build) {
      if (typeof console !== "undefined") {
        console.warn(`[useUgcSeo] No adapter registered for kind="${kind}"`);
      }
      return {};
    }
    return build(record, location.pathname) ?? {};
  }, [kind, record, location.pathname]);
  useSEO(location.pathname, seo);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ORIGIN = "https://hired.video";

function absUrl(pathname: string): string {
  return `${ORIGIN}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function clip(value: string | null | undefined, max = 160): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

function joinKeywords(values: Array<string | null | undefined>): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.length > 0 ? out.join(", ") : undefined;
}

function mirrorOg(title: string | undefined, description: string | undefined): {
  ogTitle?: string;
  ogDescription?: string;
} {
  return {
    ...(title ? { ogTitle: title } : {}),
    ...(description ? { ogDescription: description } : {}),
  };
}

// ---------------------------------------------------------------------------
// Record shapes — kept loose (Partial) so existing typings don't need to
// match exactly. Each adapter pulls what it needs and falls back gracefully.
// ---------------------------------------------------------------------------

export interface PersonRecord {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  bio?: string | null;
  profilePicture?: string | null;
  role?: string | number | null;
  skills?: string[] | null;
  industries?: string[] | null;
  /** Optional list of resume-skill keywords to merge into Person.knowsAbout. */
  resumeSkills?: string[] | null;
  /** Display label used for `jobTitle`, e.g. "Job Seeker", "Recruiter". */
  roleLabel?: string | null;
}

export interface CompanyRecord {
  id: string;
  data: {
    name: string;
    description?: string | null;
    tagline?: string | null;
    logo?: string | null;
    contact?: { website?: string | null } | null;
    headquarters?: { city?: string | null; state?: string | null } | null;
  };
}

export interface JobRecord {
  id: string;
  createdAt?: string | Date | null;
  data: {
    title: string;
    description?: string | null;
    employmentType?: string | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
    expiresAt?: string | Date | null;
    location?: { city?: string | null; state?: string | null; country?: string | null; remote?: boolean | null } | null;
    company: { name: string; logo?: string | null; logoUrl?: string | null; website?: string | null };
    skills?: string[] | null;
    skillsRequired?: string[] | null;
  };
}

export interface ResumeRecord {
  id: string;
  title?: string | null;
  slug?: string | null;
  isOwner?: boolean;
  isPublic?: boolean;
  content?: {
    basics?: {
      name?: string | null;
      label?: string | null;
      summary?: string | null;
      image?: string | null;
    } | null;
    skills?: Array<{ name?: string | null; keywords?: string[] | null } | null> | null;
  } | null;
}

export interface ArticleRecord {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  coverImageUrl?: string | null;
  category?: string | null;
  tags?: string[] | null;
  readMinutes?: number | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  bodyMd?: string | null;
  author: { id?: string; name: string; slug?: string; avatarUrl?: string | null };
}

/**
 * Single source of truth for the article cover image URL — used by both
 * the SEO adapter (ogImage) and the in-page hero in ArticleView. Falls
 * back to the per-article generated SVG at `/api/og/articles` when the
 * record has no `coverImageUrl` set, so every article (incl. the 14
 * seeded editorial pieces from migration 0113) gets a branded share
 * card + on-page hero without the editor having to upload one.
 */
export function articleCoverImageUrl(article: Pick<ArticleRecord, "title" | "category" | "publishedAt" | "coverImageUrl" | "author">): string {
  // Resolve through buildImageUrl so a relative API path (the seeded
  // `/api/og/articles?…` cover or the generated fallback below) becomes an
  // absolute URL on the API origin. The SPA is served from a static host
  // (Cloudflare Pages, hired.video) that does NOT proxy `/api` to the
  // worker (api.hired.video), so an unresolved relative `/api/og/…` src
  // 404s — the broken-image bug. Absolute upload URLs pass through as-is.
  if (article.coverImageUrl) return buildImageUrl(article.coverImageUrl)!;
  const params = new URLSearchParams({ title: article.title });
  if (article.category) params.set("category", article.category);
  if (article.publishedAt) params.set("date", article.publishedAt.slice(0, 10));
  if (article.author?.name) params.set("author", article.author.name);
  return buildImageUrl(`/api/og/articles?${params.toString()}`)!;
}

export interface BlogPostRecord {
  title: string;
  slug: string;
  description?: string | null;
  keywords?: string | string[] | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  category?: string | null;
  heroImageUrl?: string | null;
  /** Optional pre-computed word count from sections. */
  wordCount?: number;
}

export interface VideoResumeRecord {
  id: string;
  title: string;
  description?: string | null;
  metaDescription?: string | null;
  thumbnailUrl?: string | null;
  socialCardImage?: string | null;
  keywords?: string[] | null;
  youtubeUrl?: string | null;
  publishedAt?: string | null;
}

export interface TemplateListingRecord {
  slug: string;
  name: string;
  blurb?: string | null;
  industry?: string | null;
  tags?: string[] | null;
  priceCents: number;
  currency?: string | null;
  previewImageUrl?: string | null;
}

export interface VoiceCloneRecord {
  id: string;
  name: string;
  description?: string | null;
  language?: string | null;
  priceCents: number;
  currency?: string | null;
  previewImageUrl?: string | null;
}

export interface CourseRecord {
  slug: string;
  title: string;
  summary?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  category?: string | null;
  tags?: string[] | null;
  author: { name: string; slug: string };
}

export interface ChannelRecord {
  handle: string;
  displayName?: string | null;
  tagline?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  mode?: "channel" | "resume" | null;
}

export interface ShareTokenRecord {
  /** Display title; share pages don't expose record data publicly. */
  title: string;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Adapters — one per kind. Pure functions; no React, no DOM.
// ---------------------------------------------------------------------------

registerUgcSeo<PersonRecord>("person", (person, pathname) => {
  const name =
    person.fullName?.trim() ||
    [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    "User";
  const role = person.roleLabel?.trim() || "";
  const title = role ? `${name}, ${role} — hired.video` : `${name} — hired.video`;
  const description = clip(person.bio) || `${name} is a ${role || "professional"} on hired.video.`;
  const keywords = joinKeywords([
    ...(person.resumeSkills ?? []),
    ...(person.skills ?? []),
    ...(person.industries ?? []),
  ]);
  const knowsAboutList = [
    ...(person.resumeSkills ?? []),
    ...(person.skills ?? []),
    ...(person.industries ?? []),
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => !!v);
  const knowsAbout = Array.from(new Set(knowsAboutList.map((v) => v.toLowerCase())))
    .map((lower) => knowsAboutList.find((v) => v.toLowerCase() === lower)!);

  return {
    title,
    description,
    ...mirrorOg(title, description),
    ...(person.profilePicture ? { ogImage: person.profilePicture } : {}),
    ...(keywords ? { keywords } : {}),
    structuredData: generateStructuredData.profilePage({
      name,
      headline: role || undefined,
      description: clip(person.bio),
      image: person.profilePicture ?? undefined,
      url: absUrl(pathname),
      knowsAbout: knowsAbout.length > 0 ? knowsAbout : undefined,
    }),
  };
});

registerUgcSeo<CompanyRecord>("company", (company, pathname) => {
  const title = `${company.data.name} Company Profile — hired.video`;
  const description = clip(company.data.tagline) || clip(company.data.description) || "Company profile on hired.video";
  const address =
    company.data.headquarters?.city && company.data.headquarters?.state
      ? `${company.data.headquarters.city}, ${company.data.headquarters.state}`
      : undefined;
  return {
    title,
    description,
    ...mirrorOg(title, description),
    ogImage: buildImageUrl(`/api/og/companies/${company.id}`),
    structuredData: generateStructuredData.organization({
      name: company.data.name,
      description: company.data.description,
      website: company.data.contact?.website,
      logo: company.data.logo,
      address,
      reviewCount: (company as any).reviewCount,
      reviewAvgOverall: typeof (company as any).reviewAvgOverall === "string"
        ? Number((company as any).reviewAvgOverall)
        : (company as any).reviewAvgOverall,
    }),
    canonical: absUrl(pathname),
  };
});

registerUgcSeo<CompanyRecord>("companyReviews", (company, pathname) => {
  const count = (company as any).reviewCount ?? 0;
  const rawAvg = (company as any).reviewAvgOverall;
  const avg = typeof rawAvg === "string" ? Number(rawAvg) : rawAvg;
  const ratingFragment =
    typeof avg === "number" && count > 0 ? ` — ${avg.toFixed(1)}/5 from ${count} review${count === 1 ? "" : "s"}` : "";
  const title = `${company.data.name} Reviews${ratingFragment} — hired.video`;
  const description =
    count > 0
      ? `Read ${count} review${count === 1 ? "" : "s"} of ${company.data.name} from current and former employees on hired.video.`
      : `Be the first to share what it's like to work at ${company.data.name}.`;
  return {
    title,
    description,
    ...mirrorOg(title, description),
    ogImage: buildImageUrl(`/api/og/companies/${company.id}`),
    structuredData: generateStructuredData.organization({
      name: company.data.name,
      description: company.data.description,
      website: company.data.contact?.website,
      logo: company.data.logo,
      reviewCount: count,
      reviewAvgOverall: avg,
    }),
    canonical: absUrl(pathname),
  };
});

registerUgcSeo<JobRecord>("job", (job, pathname) => {
  const company = job.data.company;
  const loc = job.data.location;
  const locationLabel = loc?.remote
    ? "Remote"
    : loc?.city
    ? `${loc.city}${loc.state ? `, ${loc.state}` : ""}`
    : undefined;
  const title = `${job.data.title} at ${company.name} — hired.video`;
  const descPrefix = `${job.data.title} at ${company.name}${locationLabel ? ` (${locationLabel})` : ""}. `;
  const description = clip(descPrefix + (job.data.description ?? ""), 200);
  const skills = job.data.skills ?? job.data.skillsRequired ?? [];
  const keywords = joinKeywords([job.data.title, company.name, locationLabel, ...skills]);
  const logo = company.logo ?? company.logoUrl ?? undefined;
  return {
    title,
    description,
    ...mirrorOg(title, description),
    ...(logo ? { ogImage: logo } : {}),
    ...(keywords ? { keywords } : {}),
    structuredData: generateStructuredData.jobPosting({
      id: job.id,
      title: job.data.title,
      description: job.data.description ?? "",
      postedDate: job.createdAt ?? undefined,
      validThrough: job.data.expiresAt ?? undefined,
      employmentType: job.data.employmentType ?? undefined,
      companyName: company.name,
      companyLogoUrl: logo,
      companyWebsite: company.website ?? undefined,
      isRemote: !!loc?.remote,
      city: loc?.city ?? undefined,
      state: loc?.state ?? undefined,
      country: loc?.country ?? undefined,
      salaryMin: job.data.salaryMin ?? undefined,
      salaryMax: job.data.salaryMax ?? undefined,
      salaryCurrency: job.data.salaryCurrency ?? undefined,
      skills: skills.length > 0 ? skills : undefined,
      url: absUrl(pathname),
    }),
  };
});

registerUgcSeo<ResumeRecord>("resume", (resume, pathname) => {
  const basics = resume.content?.basics ?? null;
  const name = basics?.name?.trim() || resume.title?.trim() || "Resume";
  const role = basics?.label?.trim() || "";
  const summary = clip(basics?.summary, 200);
  const title = role ? `${name} — ${role} | hired.video` : `${name}'s Resume — hired.video`;
  const description = summary || `${name}'s resume on hired.video.`;
  const resumeSkillTokens = (resume.content?.skills ?? []).flatMap((s) => [
    ...(s?.name ? [s.name] : []),
    ...((s?.keywords ?? []) as string[]),
  ]);
  const keywords = joinKeywords([role, ...resumeSkillTokens]);
  return {
    title,
    description,
    ...mirrorOg(title, description),
    ...(basics?.image ? { ogImage: basics.image } : {}),
    ...(keywords ? { keywords } : {}),
    structuredData: generateStructuredData.profilePage({
      name,
      headline: role || undefined,
      description: summary,
      image: basics?.image ?? undefined,
      url: absUrl(pathname),
      knowsAbout: resumeSkillTokens.length > 0 ? Array.from(new Set(resumeSkillTokens)) : undefined,
    }),
  };
});

registerUgcSeo<ArticleRecord>("article", (article, pathname) => {
  const title = `${article.title} — hired.video`;
  const description = clip(article.summary) || clip(article.bodyMd, 160) || `${article.title} on hired.video.`;
  const keywords = joinKeywords([article.category, ...(article.tags ?? [])]);
  const ogImage = articleCoverImageUrl(article);
  return {
    title,
    description,
    ...mirrorOg(title, description),
    ogImage,
    ...(keywords ? { keywords } : {}),
    structuredData: generateStructuredData.article({
      type: "Article",
      headline: article.title,
      description: clip(article.summary, 200),
      image: ogImage,
      datePublished: article.publishedAt ?? undefined,
      dateModified: article.updatedAt ?? article.publishedAt ?? undefined,
      authorName: article.author?.name,
      authorUrl: article.author?.slug ? `${ORIGIN}/people/${article.author.slug}` : undefined,
      keywords: article.tags ?? undefined,
      url: absUrl(pathname),
    }),
  };
});

registerUgcSeo<BlogPostRecord>("blogPost", (post, pathname) => {
  const title = `${post.title} — hired.video`;
  const description = clip(post.description) || `${post.title} on hired.video.`;
  const tagArray = Array.isArray(post.keywords)
    ? post.keywords
    : typeof post.keywords === "string"
    ? post.keywords.split(",").map((s) => s.trim())
    : [];
  const keywords = joinKeywords([post.category, ...tagArray]);
  return {
    title,
    description,
    ...mirrorOg(title, description),
    ...(post.heroImageUrl ? { ogImage: post.heroImageUrl } : {}),
    ...(keywords ? { keywords } : {}),
    structuredData: generateStructuredData.article({
      type: "BlogPosting",
      headline: post.title,
      description: clip(post.description, 200),
      image: post.heroImageUrl ?? undefined,
      datePublished: post.publishedAt ?? undefined,
      dateModified: post.updatedAt ?? post.publishedAt ?? undefined,
      authorName: "Sean Hogg",
      authorUrl: "https://hired.video/people/seanhogg",
      keywords: tagArray.length > 0 ? tagArray : undefined,
      url: absUrl(pathname),
      wordCount: post.wordCount,
    }),
  };
});

registerUgcSeo<VideoResumeRecord>("videoResume", (video, pathname) => {
  const title = `${video.title} — hired.video`;
  const description =
    clip(video.metaDescription) ||
    clip(video.description) ||
    `Watch ${video.title} on hired.video.`;
  const image = video.socialCardImage ?? video.thumbnailUrl ?? undefined;
  const keywords = joinKeywords(video.keywords ?? []);
  return {
    title,
    description,
    ...mirrorOg(title, description),
    ...(image ? { ogImage: image } : {}),
    ...(keywords ? { keywords } : {}),
    structuredData: generateStructuredData.videoObject({
      name: video.title,
      description: clip(video.description ?? video.metaDescription, 200),
      thumbnailUrl: video.thumbnailUrl ?? undefined,
      uploadDate: video.publishedAt ?? undefined,
      embedUrl: video.youtubeUrl ?? undefined,
      url: absUrl(pathname),
    }),
  };
});

registerUgcSeo<TemplateListingRecord>("templateListing", (tpl, pathname) => {
  const title = `${tpl.name} — hired.video Marketplace`;
  const description =
    clip(tpl.blurb) ||
    `Preview the "${tpl.name}" template${tpl.industry ? ` for ${tpl.industry}` : ""} — buy once, apply anywhere.`;
  const keywords = joinKeywords([tpl.name, tpl.industry, ...(tpl.tags ?? []), "hired.video marketplace", "templates"]);
  return {
    title,
    description,
    ...mirrorOg(title, description),
    ...(tpl.previewImageUrl ? { ogImage: tpl.previewImageUrl } : {}),
    ...(keywords ? { keywords } : {}),
    structuredData: generateStructuredData.product({
      name: tpl.name,
      description: clip(tpl.blurb, 200),
      image: tpl.previewImageUrl ?? undefined,
      category: tpl.industry ?? "Templates",
      priceCents: tpl.priceCents,
      currency: tpl.currency ?? undefined,
      url: absUrl(pathname),
    }),
  };
});

registerUgcSeo<VoiceCloneRecord>("voiceClone", (voice, pathname) => {
  const title = `${voice.name} — Voice Clone | hired.video`;
  const description =
    clip(voice.description) ||
    `Use the "${voice.name}" AI voice in your hired.video Studio projects.`;
  const keywords = joinKeywords([voice.name, voice.language, "AI voice", "voice clone", "hired.video marketplace"]);
  return {
    title,
    description,
    ...mirrorOg(title, description),
    ...(voice.previewImageUrl ? { ogImage: voice.previewImageUrl } : {}),
    ...(keywords ? { keywords } : {}),
    structuredData: generateStructuredData.product({
      name: voice.name,
      description: clip(voice.description, 200),
      image: voice.previewImageUrl ?? undefined,
      category: "Voice Clones",
      priceCents: voice.priceCents,
      currency: voice.currency ?? undefined,
      url: absUrl(pathname),
    }),
  };
});

registerUgcSeo<CourseRecord>("course", (course, pathname) => {
  const title = `${course.title} — Course by ${course.author.name} | hired.video`;
  const description = clip(course.summary) || clip(course.description) || `Learn ${course.title} on hired.video.`;
  const keywords = joinKeywords([course.title, course.category, ...(course.tags ?? []), "hired.video courses"]);
  return {
    title,
    description,
    ...mirrorOg(title, description),
    ...(course.coverImageUrl ? { ogImage: buildImageUrl(course.coverImageUrl) } : {}),
    ...(keywords ? { keywords } : {}),
    structuredData: generateStructuredData.course({
      name: course.title,
      description: clip(course.summary ?? course.description, 200),
      image: buildImageUrl(course.coverImageUrl) ?? undefined,
      instructorName: course.author.name,
      instructorUrl: course.author.slug ? `${ORIGIN}/people/${course.author.slug}` : undefined,
      url: absUrl(pathname),
    }),
  };
});

registerUgcSeo<ChannelRecord>("channel", (channel, pathname) => {
  const name = channel.displayName?.trim() || channel.handle;
  const tagline = clip(channel.tagline);
  const bio = clip(channel.bio);
  const title = tagline ? `${name} — ${tagline} | hired.video` : `${name} — hired.video`;
  const description = bio || tagline || `${name}'s channel on hired.video.`;
  return {
    title,
    description,
    ...mirrorOg(title, description),
    ...(channel.avatarUrl ? { ogImage: channel.avatarUrl } : {}),
    structuredData: generateStructuredData.profilePage({
      name,
      headline: tagline,
      description: bio,
      image: channel.avatarUrl ?? undefined,
      url: absUrl(pathname),
    }),
  };
});

/**
 * Share-token surfaces (candidate resume, pitch deck) are intentionally
 * unindexable — they're access-controlled by a token, not by login.
 * `robots: noindex, nofollow` is non-negotiable.
 */
registerUgcSeo<ShareTokenRecord>("shareToken", (share) => {
  const title = `${share.title} — hired.video`;
  const description = clip(share.description) || share.title;
  return {
    title,
    description,
    ...mirrorOg(title, description),
    robots: "noindex, nofollow",
  };
});
