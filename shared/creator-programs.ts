/**
 * Creator Program — single source of truth for the program enum and the
 * derivations that hang off it (terms-doc kinds, marketplace categories,
 * active-flag columns).
 *
 * Imported by both the API routes (`routes/creators.ts`, `routes/users.ts`)
 * and the frontend creator-service so the program list, terms-kind mapping,
 * and category derivation never drift between the two.
 */

export const CREATOR_PROGRAMS = ["video", "voice", "services", "articles", "courses", "templates", "bookings", "coaching"] as const;
export type CreatorProgram = (typeof CREATOR_PROGRAMS)[number];

export const PROGRAM_TERMS_KIND: Record<CreatorProgram, string> = {
  video: "program_video_terms",
  voice: "program_voice_terms",
  services: "program_services_terms",
  articles: "program_articles_terms",
  courses: "program_courses_terms",
  templates: "program_templates_terms",
  bookings: "program_bookings_terms",
  coaching: "program_coaching_terms",
};

// Marketplace search-facet category written into `creator_profiles.categories`
// (jsonb) on every flag change. Matches the `?category=` query string used by
// `/search` and `/api/creators/browse`.
export const PROGRAM_CATEGORY: Record<CreatorProgram, string> = {
  video: "promo_video",
  voice: "voice_clone",
  services: "services",
  articles: "articles",
  courses: "courses",
  templates: "templates",
  bookings: "bookings",
  coaching: "career_coaching",
};

export function isCreatorProgram(p: unknown): p is CreatorProgram {
  return typeof p === "string" && (CREATOR_PROGRAMS as readonly string[]).includes(p);
}

export type CreatorProgramFlags = {
  videoActive?: boolean | null;
  voiceActive?: boolean | null;
  servicesActive?: boolean | null;
  articlesActive?: boolean | null;
  coursesActive?: boolean | null;
  templatesActive?: boolean | null;
  bookingsActive?: boolean | null;
  coachingActive?: boolean | null;
};

export type CreatorProgramFlagColumn =
  | "videoActive" | "voiceActive" | "servicesActive" | "articlesActive" | "coursesActive" | "templatesActive" | "bookingsActive" | "coachingActive";

export function programFlagColumn(program: CreatorProgram): CreatorProgramFlagColumn {
  return program === "video" ? "videoActive"
    : program === "voice" ? "voiceActive"
    : program === "services" ? "servicesActive"
    : program === "articles" ? "articlesActive"
    : program === "courses" ? "coursesActive"
    : program === "templates" ? "templatesActive"
    : program === "bookings" ? "bookingsActive"
    : "coachingActive";
}

export function activeFlagsToPrograms(flags: CreatorProgramFlags): CreatorProgram[] {
  const out: CreatorProgram[] = [];
  if (flags.videoActive) out.push("video");
  if (flags.voiceActive) out.push("voice");
  if (flags.servicesActive) out.push("services");
  if (flags.articlesActive) out.push("articles");
  if (flags.coursesActive) out.push("courses");
  if (flags.templatesActive) out.push("templates");
  if (flags.bookingsActive) out.push("bookings");
  if (flags.coachingActive) out.push("coaching");
  return out;
}

export function programsToCategories(programs: readonly CreatorProgram[]): string[] {
  return Array.from(new Set(programs.map((p) => PROGRAM_CATEGORY[p])));
}

// At-least-one-program test against the active-flag set. Mirrors the
// `is_active` derived column on `creator_profiles`.
export function deriveIsActive(flags: CreatorProgramFlags): boolean {
  return !!(flags.videoActive || flags.voiceActive || flags.servicesActive
    || flags.articlesActive || flags.coursesActive || flags.templatesActive
    || flags.bookingsActive || flags.coachingActive);
}
