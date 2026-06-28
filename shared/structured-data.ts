/**
 * Structured-data (schema.org JSON-LD) builders — SHARED SSoT.
 *
 * Moved here from `frontend/lib/seo.ts` so BOTH sides emit byte-identical
 * JSON-LD:
 *   • the frontend injects it client-side via useSEO / useUgcSeo;
 *   • the API worker injects the SAME shapes into the HTML served to search /
 *     AI crawlers (the per-entity OG meta endpoints in api/src/routes/og.ts).
 * Before this module each worker endpoint hand-mirrored the builder with a
 * "keep in sync" comment — this removes that drift. `frontend/lib/seo.ts`
 * re-exports everything here so existing frontend imports are unchanged.
 *
 * Pure data only — no React, no DOM — so it compiles under both the Vite
 * (frontend) and Workers (api) builds.
 */

const CANONICAL_ORIGIN = "https://hired.video";

export interface JobPostingInput {
  id?: string;
  title: string;
  description: string;
  /** ISO-8601 date string. */
  postedDate?: string | Date;
  /** ISO-8601 date string. */
  validThrough?: string | Date;
  employmentType?: string; // e.g. "full_time", "Contract"
  companyName: string;
  companyLogoUrl?: string;
  companyWebsite?: string;
  /** Set true for fully-remote roles — emits jobLocationType=TELECOMMUTE. */
  isRemote?: boolean;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  /** Numeric salary in dollars (annual unless `salaryUnit` is set). */
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string; // ISO 4217, defaults to USD
  /** YEAR | MONTH | WEEK | DAY | HOUR — defaults to YEAR. */
  salaryUnit?: "YEAR" | "MONTH" | "WEEK" | "DAY" | "HOUR";
  /** Canonical URL for the job posting (defaults to hired.video/jobs/{id}). */
  url?: string;
  /** Skills, requirements — emitted as `skills` if present. */
  skills?: string[];
}

/**
 * Schema.org employment type values accepted by Google for Jobs.
 * Maps from our internal slugs (full_time, part_time, contract, …)
 * to the spec values (FULL_TIME, PART_TIME, …).
 */
function normalizeEmploymentType(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[\s-]+/g, "_").toUpperCase();
  const allowed = new Set([
    "FULL_TIME",
    "PART_TIME",
    "CONTRACTOR",
    "CONTRACT",
    "TEMPORARY",
    "INTERN",
    "INTERNSHIP",
    "VOLUNTEER",
    "PER_DIEM",
    "OTHER",
  ]);
  // Spec uses CONTRACTOR; our app uses CONTRACT — map both.
  if (normalized === "CONTRACT") return "CONTRACTOR";
  if (normalized === "INTERN") return "INTERNSHIP";
  return allowed.has(normalized) ? normalized : "OTHER";
}

/**
 * Split a combined free-text location label ("City, State, Country") into
 * schema.org PostalAddress parts for JobPosting.jobLocation. Best-effort, used
 * when only a single combined string is stored (jobItems.location): 1 part →
 * city; 2 → city + region; 3+ → city + region + country (last segment).
 */
export function splitJobLocation(location?: string | null): {
  city?: string;
  state?: string;
  country?: string;
} {
  if (!location) return {};
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { city: parts[0] };
  if (parts.length === 2) return { city: parts[0], state: parts[1] };
  return { city: parts[0], state: parts[1], country: parts[parts.length - 1] };
}

function toIsoString(value?: string | Date): string | undefined {
  if (!value) return undefined;
  try {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  } catch {
    return undefined;
  }
}

export const generateStructuredData = {
  /**
   * Build a schema.org JobPosting object. Used both for SEO (Google
   * for Jobs) and as the source of truth that the hired.video Chrome
   * extension's `parseJobFromPage` reads when extracting job pages.
   */
  jobPosting: (job: JobPostingInput) => {
    const datePosted = toIsoString(job.postedDate) ?? new Date().toISOString();
    // Google for Jobs requires validThrough; default to 30 days out
    // when the caller doesn't supply one.
    const validThrough =
      toIsoString(job.validThrough) ??
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const address: Record<string, string> = { "@type": "PostalAddress" };
    if (job.city) address.addressLocality = job.city;
    if (job.state) address.addressRegion = job.state;
    if (job.country) address.addressCountry = job.country;
    if (job.postalCode) address.postalCode = job.postalCode;

    const jobLocation = job.isRemote
      ? undefined
      : {
          "@type": "Place",
          address: Object.keys(address).length > 1 ? address : { "@type": "PostalAddress", addressCountry: "US" },
        };

    const applicantLocationRequirements = job.isRemote
      ? { "@type": "Country", name: job.country || "US" }
      : undefined;

    const baseSalary =
      job.salaryMin || job.salaryMax
        ? {
            "@type": "MonetaryAmount",
            currency: job.salaryCurrency || "USD",
            value: {
              "@type": "QuantitativeValue",
              minValue: job.salaryMin,
              maxValue: job.salaryMax,
              unitText: job.salaryUnit || "YEAR",
            },
          }
        : undefined;

    const url =
      job.url ||
      (job.id ? `https://hired.video/jobs/${job.id}` : undefined);

    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: job.title,
      description: job.description,
      datePosted,
      validThrough,
      employmentType: normalizeEmploymentType(job.employmentType),
      hiringOrganization: {
        "@type": "Organization",
        name: job.companyName,
        ...(job.companyWebsite ? { sameAs: job.companyWebsite } : {}),
        ...(job.companyLogoUrl ? { logo: job.companyLogoUrl } : {}),
      },
      ...(jobLocation ? { jobLocation } : {}),
      ...(job.isRemote
        ? {
            jobLocationType: "TELECOMMUTE",
            ...(applicantLocationRequirements
              ? { applicantLocationRequirements }
              : {}),
          }
        : {}),
      ...(baseSalary ? { baseSalary } : {}),
      ...(job.id ? { identifier: { "@type": "PropertyValue", name: "hired.video", value: job.id } } : {}),
      ...(url ? { url, directApply: true } : {}),
      ...(job.skills && job.skills.length > 0 ? { skills: job.skills.join(", ") } : {}),
    };

    return data;
  },

  organization: (company: any) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: company.name,
      description: company.description,
      url: company.website,
      logo: company.logo,
      address: company.address,
    };
    if (
      typeof company.reviewCount === "number" &&
      company.reviewCount > 0 &&
      typeof company.reviewAvgOverall === "number"
    ) {
      data.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: company.reviewAvgOverall.toFixed(1),
        reviewCount: String(company.reviewCount),
        bestRating: "5",
        worstRating: "1",
      };
    }
    return data;
  },

  person: (person: {
    name: string;
    title?: string;
    bio?: string;
    avatar?: string;
    id: string;
    knowsAbout?: string[];
  }) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: person.name,
      jobTitle: person.title,
      description: person.bio,
      image: person.avatar,
      url: `https://hired.video/people/${person.id}`,
    };
    if (person.knowsAbout && person.knowsAbout.length > 0) {
      data.knowsAbout = person.knowsAbout;
    }
    return data;
  },

  article: (input: {
    type?: "Article" | "BlogPosting" | "NewsArticle";
    headline: string;
    description?: string;
    image?: string;
    datePublished?: string;
    dateModified?: string;
    authorName?: string;
    authorUrl?: string;
    keywords?: string[];
    url: string;
    wordCount?: number;
  }) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": input.type ?? "Article",
      headline: input.headline,
      mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
      publisher: {
        "@type": "Organization",
        name: "hired.video",
        logo: { "@type": "ImageObject", url: "https://hired.video/og-image.svg" },
      },
    };
    if (input.description) data.description = input.description;
    if (input.image) data.image = input.image;
    if (input.datePublished) data.datePublished = input.datePublished;
    if (input.dateModified) data.dateModified = input.dateModified;
    if (input.authorName) {
      data.author = {
        "@type": "Person",
        name: input.authorName,
        ...(input.authorUrl ? { url: input.authorUrl } : {}),
      };
    }
    if (input.keywords && input.keywords.length > 0) data.keywords = input.keywords.join(", ");
    if (typeof input.wordCount === "number") data.wordCount = input.wordCount;
    return data;
  },

  course: (input: {
    name: string;
    description?: string;
    image?: string;
    instructorName?: string;
    instructorUrl?: string;
    url: string;
  }) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Course",
      name: input.name,
      provider: { "@type": "Organization", name: "hired.video", sameAs: "https://hired.video" },
      url: input.url,
    };
    if (input.description) data.description = input.description;
    if (input.image) data.image = input.image;
    if (input.instructorName) {
      data.instructor = {
        "@type": "Person",
        name: input.instructorName,
        ...(input.instructorUrl ? { url: input.instructorUrl } : {}),
      };
    }
    return data;
  },

  product: (input: {
    name: string;
    description?: string;
    image?: string;
    category?: string;
    priceCents?: number;
    currency?: string;
    url: string;
  }) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: input.name,
      brand: { "@type": "Organization", name: "hired.video" },
      url: input.url,
    };
    if (input.description) data.description = input.description;
    if (input.image) data.image = input.image;
    if (input.category) data.category = input.category;
    if (typeof input.priceCents === "number") {
      data.offers = {
        "@type": "Offer",
        price: (input.priceCents / 100).toFixed(2),
        priceCurrency: input.currency ?? "USD",
        availability: "https://schema.org/InStock",
        url: input.url,
      };
    }
    return data;
  },

  videoObject: (input: {
    name: string;
    description?: string;
    thumbnailUrl?: string;
    uploadDate?: string;
    contentUrl?: string;
    embedUrl?: string;
    url: string;
  }) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: input.name,
      url: input.url,
    };
    if (input.description) data.description = input.description;
    if (input.thumbnailUrl) data.thumbnailUrl = input.thumbnailUrl;
    if (input.uploadDate) data.uploadDate = input.uploadDate;
    if (input.contentUrl) data.contentUrl = input.contentUrl;
    if (input.embedUrl) data.embedUrl = input.embedUrl;
    return data;
  },

  /**
   * ProfilePage with embedded Person mainEntity — the Google-preferred
   * markup for someone's resume / public profile page.
   */
  profilePage: (input: {
    name: string;
    headline?: string;
    description?: string;
    image?: string;
    url: string;
    knowsAbout?: string[];
  }) => {
    const person: Record<string, unknown> = {
      "@type": "Person",
      name: input.name,
    };
    if (input.headline) person.jobTitle = input.headline;
    if (input.description) person.description = input.description;
    if (input.image) person.image = input.image;
    if (input.knowsAbout && input.knowsAbout.length > 0) person.knowsAbout = input.knowsAbout;
    return {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url: input.url,
      mainEntity: person,
    };
  },

  /**
   * schema.org Event — networking events / coffee meetups (/events/:idOrSlug).
   * `attendanceMode` maps our event_format (in_person | remote | hybrid) to
   * the spec attendance-mode enum; `location` is always emitted (Google
   * requires it) — a Place for physical, a VirtualLocation for online.
   */
  event: (input: {
    name: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    url: string;
    image?: string;
    locationName?: string;
    onlineUrl?: string;
    attendanceMode?: "in_person" | "remote" | "hybrid";
    organizerName?: string;
    isCancelled?: boolean;
  }) => {
    const mode = input.attendanceMode ?? "in_person";
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Event",
      name: input.name,
      url: input.url,
      eventStatus: input.isCancelled
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
      eventAttendanceMode:
        mode === "remote"
          ? "https://schema.org/OnlineEventAttendanceMode"
          : mode === "hybrid"
          ? "https://schema.org/MixedEventAttendanceMode"
          : "https://schema.org/OfflineEventAttendanceMode",
    };
    if (input.description) data.description = input.description;
    if (input.image) data.image = input.image;
    if (input.startDate) data.startDate = input.startDate;
    if (input.endDate) data.endDate = input.endDate;

    const locations: unknown[] = [];
    if (mode !== "remote" && input.locationName) {
      locations.push({ "@type": "Place", name: input.locationName, address: input.locationName });
    }
    if ((mode === "remote" || mode === "hybrid") && input.onlineUrl) {
      locations.push({ "@type": "VirtualLocation", url: input.onlineUrl });
    }
    data.location =
      locations.length > 1
        ? locations
        : locations[0] ?? { "@type": "VirtualLocation", url: input.url };

    data.organizer = input.organizerName
      ? { "@type": "Organization", name: input.organizerName }
      : { "@type": "Organization", name: "hired.video", url: CANONICAL_ORIGIN };
    return data;
  },
};

/**
 * Build a schema.org BreadcrumbList for SERP breadcrumb trails.
 *
 * Usage:
 *   generateBreadcrumbs([
 *     { name: "Tools", url: "/tools" },
 *     { name: "AI Resume Scorer", url: "/tools/ai-resume-scorer" },
 *   ])
 */
export function generateBreadcrumbs(
  items: { name: string; url: string }[],
): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${CANONICAL_ORIGIN}${item.url}`,
    })),
  };
}

/**
 * Build a schema.org Product with multiple Offer entries for SaaS pricing.
 * Used on the Pricing page for rich snippets.
 */
export function generatePricingSchema(plans: {
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice?: number;
  currency?: string;
  features?: string[];
}[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "hired.video",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser",
    url: "https://hired.video",
    offers: plans.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      description: plan.description,
      price: String(plan.monthlyPrice),
      priceCurrency: plan.currency || "USD",
      ...(plan.annualPrice != null
        ? {
            priceSpecification: [
              {
                "@type": "UnitPriceSpecification",
                price: String(plan.monthlyPrice),
                priceCurrency: plan.currency || "USD",
                unitText: "MONTH",
                referenceQuantity: { "@type": "QuantitativeValue", value: "1", unitCode: "MON" },
              },
              {
                "@type": "UnitPriceSpecification",
                price: String(plan.annualPrice),
                priceCurrency: plan.currency || "USD",
                unitText: "YEAR",
                referenceQuantity: { "@type": "QuantitativeValue", value: "1", unitCode: "ANN" },
              },
            ],
          }
        : {}),
    })),
  };
}
