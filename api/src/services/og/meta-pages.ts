/**
 * Crawler-facing meta (title + description + guaranteed image + schema.org
 * JSON-LD) for page entities, consumed by the Cloudflare Pages Function so
 * search/AI crawlers get rich results without executing the SPA. JSON-LD is
 * built with the shared SSoT builders the frontend injects client-side.
 * A `null` title tells the Pages Function to leave the SPA meta untouched.
 */
import { publicArticlePath } from "../../../../shared/public-paths.js";
import { generateStructuredData, splitJobLocation } from "../../../../shared/structured-data.js";
import type {
  OgArticleRow,
  OgCompanyRow,
  OgCourseRow,
  OgEventRow,
  OgJobRow,
  OgPersonRow,
} from "../../repositories/ogPageEntityRepository.js";
import type { OgMetaBody } from "./og-entity-kind.js";

const nullMeta = (): OgMetaBody => ({ title: null, description: null, image: null, jsonLd: [] });

/** Absolutize a possibly-relative stored image path onto the worker origin
 *  (the SPA host doesn't proxy /api or /uploads). Already-absolute URLs pass
 *  through. */
function absImg(o: string, path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${o}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** /articles/:authorSlug/:slug — Article JSON-LD. */
export function buildArticleMeta(row: OgArticleRow, slug: string, origin: string): OgMetaBody {
  if (!row) {
    return { title: "Article — hired.video", description: null, image: null, jsonLd: [] };
  }

  const title = `${row.title} — hired.video`;
  const description = (row.summary ?? "").trim().slice(0, 160) || `${row.title} on hired.video.`;
  // Same fallback chain as articleCoverImageUrl: a stored cover (absolutized
  // onto the API origin), else the generated card.
  const image = absImg(origin, row.coverImageUrl)
    ?? `${origin}/api/og/articles?${new URLSearchParams({
      title: row.title,
      ...(row.category ? { category: row.category } : {}),
      ...(row.publishedAt ? { date: row.publishedAt.toISOString().slice(0, 10) } : {}),
      ...(row.authorName ? { author: row.authorName } : {}),
    }).toString()}`;
  const authorRef = row.authorSlug ?? row.authorId;
  const pageUrl = `https://hired.video${publicArticlePath(authorRef, slug)}`;

  return {
    title,
    description,
    image,
    jsonLd: [
      generateStructuredData.article({
        type: "Article",
        headline: row.title,
        description,
        image,
        url: pageUrl,
        datePublished: row.publishedAt ? row.publishedAt.toISOString() : undefined,
        dateModified: (row.updatedAt ?? row.publishedAt)?.toISOString(),
        authorName: row.authorName ?? undefined,
        authorUrl: row.authorName ? `https://hired.video/people/${authorRef}` : undefined,
        keywords: Array.isArray(row.tags) && row.tags.length > 0 ? (row.tags as string[]) : undefined,
      }),
    ],
  };
}

/** /people/:id — ProfilePage JSON-LD. Only PUBLIC profiles resolve, so
 *  private profiles are never leaked or indexed. */
export function buildPersonMeta(row: OgPersonRow, userRef: string, o: string): OgMetaBody {
  if (!row || row.visibility !== "public") return nullMeta();

  const name = row.name ?? "Professional";
  const headline = (row.headline ?? "").trim();
  const title = headline ? `${name}, ${headline} — hired.video` : `${name} — hired.video`;
  const description = headline
    ? `${name} — ${headline}. View the full profile on hired.video.`
    : `${name}'s professional profile on hired.video.`;
  const ref = row.slug ?? userRef;
  const pageUrl = `https://hired.video/people/${ref}`;
  const image = absImg(o, row.avatarUrl)
    ?? `${o}/api/og/page?${new URLSearchParams({ title: name, eyebrow: "PROFILE", subtitle: headline }).toString()}`;

  return {
    title,
    description,
    image,
    jsonLd: [
      generateStructuredData.profilePage({
        name,
        headline: headline || undefined,
        image: row.avatarUrl ? image : undefined,
        url: pageUrl,
      }),
    ],
  };
}

/** /jobs/:id — JobPosting (Google for Jobs). Inactive roles aren't indexed. */
export function buildJobMeta(row: OgJobRow, id: string, o: string): OgMetaBody {
  if (!row || row.isActive === false) return nullMeta();

  const companyName = row.companyName ?? row.company ?? "a company";
  const title = `${row.title} at ${companyName} — hired.video`;
  const description = ((row.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200))
    || `${row.title} at ${companyName}. Apply on hired.video.`;
  const logo = absImg(o, row.companyLogo);
  const image = absImg(o, row.heroImageUrl)
    ?? logo
    ?? `${o}/api/og/page?${new URLSearchParams({ title: row.title, eyebrow: "JOB", subtitle: companyName }).toString()}`;
  const num = (v: unknown) => (v == null ? undefined : Number(v));
  // jobItems stores a single combined location string — split it into
  // city/state/country so non-remote roles emit a proper PostalAddress.
  const geo = row.isRemote ? {} : splitJobLocation(row.location);

  return {
    title,
    description,
    image,
    jsonLd: [
      generateStructuredData.jobPosting({
        id,
        title: row.title,
        description: row.description || row.title,
        postedDate: row.createdAt ?? undefined,
        validThrough: row.expiresAt ?? undefined,
        employmentType: row.jobType ?? undefined,
        companyName,
        companyLogoUrl: logo ?? undefined,
        companyWebsite: row.companyWebsite ?? undefined,
        isRemote: !!row.isRemote,
        city: geo.city,
        state: geo.state,
        country: geo.country,
        salaryMin: num(row.salaryMin),
        salaryMax: num(row.salaryMax),
        salaryCurrency: row.salaryCurrency ?? undefined,
        skills: Array.isArray(row.skillsRequired) ? (row.skillsRequired as string[]) : undefined,
        url: `https://hired.video/jobs/${id}`,
      }),
    ],
  };
}

/** /companies/:id — Organization (+ aggregateRating). */
export function buildCompanyMeta(row: OgCompanyRow, o: string): OgMetaBody {
  if (!row) return nullMeta();

  const title = `${row.name} Company Profile — hired.video`;
  const description = (row.tagline ?? row.description ?? "").trim().slice(0, 200)
    || `${row.name} on hired.video.`;
  const hq = (row.headquarters ?? null) as { city?: string | null; state?: string | null } | null;
  const address = hq?.city ? `${hq.city}${hq.state ? `, ${hq.state}` : ""}` : undefined;

  return {
    title,
    description,
    image: `${o}/api/og/companies/${row.id}`,
    jsonLd: [
      generateStructuredData.organization({
        name: row.name,
        description: row.description,
        website: row.website,
        logo: absImg(o, row.logoUrl),
        address,
        reviewCount: row.reviewCount,
        reviewAvgOverall: row.reviewAvg == null ? undefined : Number(row.reviewAvg),
      }),
    ],
  };
}

/** /courses/:authorSlug/:courseSlug — Course JSON-LD. */
export function buildCourseMeta(row: OgCourseRow, slug: string, o: string): OgMetaBody {
  if (!row) return nullMeta();

  const authorRef = row.authorSlug ?? row.authorId;
  const pageUrl = `https://hired.video/courses/${authorRef}/${slug}`;
  const title = `${row.title} — Course by ${row.authorName ?? "a creator"} | hired.video`;
  const description = (row.summary ?? row.description ?? "").trim().slice(0, 200)
    || `Learn ${row.title} on hired.video.`;
  const image = absImg(o, row.coverImageUrl)
    ?? `${o}/api/og/courses?${new URLSearchParams({ title: row.title, ...(row.category ? { category: row.category } : {}) }).toString()}`;

  return {
    title,
    description,
    image,
    jsonLd: [
      generateStructuredData.course({
        name: row.title,
        description,
        image,
        instructorName: row.authorName ?? undefined,
        instructorUrl: `https://hired.video/people/${authorRef}`,
        url: pageUrl,
      }),
    ],
  };
}

/** /events/:idOrSlug — Event JSON-LD (public events only). */
export function buildEventMeta(row: OgEventRow, o: string): OgMetaBody {
  if (!row) return nullMeta();

  const ref = row.slug ?? row.id;
  const pageUrl = `https://hired.video/events/${ref}`;
  const title = `${row.title} — hired.video`;
  const description = (row.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200)
    || `${row.title} — a networking event on hired.video.`;
  const image = absImg(o, row.coverImageUrl)
    ?? `${o}/api/og/page?${new URLSearchParams({ title: row.title, eyebrow: "EVENT" }).toString()}`;
  const mode = (row.eventFormat === "remote" || row.eventFormat === "hybrid") ? row.eventFormat : "in_person";

  return {
    title,
    description,
    image,
    jsonLd: [
      generateStructuredData.event({
        name: row.title,
        description,
        startDate: row.startAt ? row.startAt.toISOString() : undefined,
        endDate: row.endAt ? row.endAt.toISOString() : undefined,
        url: pageUrl,
        image,
        locationName: row.location ?? undefined,
        onlineUrl: row.meetingUrl ?? undefined,
        attendanceMode: mode as "in_person" | "remote" | "hybrid",
        organizerName: row.hostName ?? undefined,
        isCancelled: row.status === "cancelled",
      }),
    ],
  };
}
