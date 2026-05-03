/**
 * Studio Project Subject — single source of truth for the polymorphic
 * "what entity is this video about?" pair.
 *
 * Used in three places that must agree:
 *   • API: saveDraft / GET-projects validation + persistence
 *   • Frontend studio-service: schema + payload typing
 *   • Frontend Studio bootstrap + EntityVideos: URL `?subject=kind:id`
 *     parsing and link generation
 *
 * Keeping the enum, parse, and format here means a future entity type
 * (e.g. "course") needs one edit to ship across the stack.
 */

export const STUDIO_SUBJECT_KINDS = [
  "resume",
  "profile",
  "job",
  "company",
  "skills_demo",
  // The actor (delegate / contributor / video editor) credited for
  // producing the video on behalf of the subject. Lets a contractor
  // surface delegated work on their own portfolio page even though
  // ownership of the asset stays with the subject (per the workspace
  // model in services/studio/workspace.ts). The EntityVideos scroller
  // on a profile picks this up automatically.
  "creator_credit",
] as const;

export type StudioSubjectKind = (typeof STUDIO_SUBJECT_KINDS)[number];

export interface StudioSubject {
  kind: StudioSubjectKind;
  id: string;
}

export function isStudioSubjectKind(value: unknown): value is StudioSubjectKind {
  return typeof value === "string" && (STUDIO_SUBJECT_KINDS as readonly string[]).includes(value);
}

/** Format as the URL deep-link form `kind:id` (used in `/studio?subject=...`). */
export function formatStudioSubject(subject: StudioSubject): string {
  return `${subject.kind}:${subject.id}`;
}

/** Parse the URL deep-link form. Returns null on invalid input so callers
 *  can branch cleanly without try/catch. */
export function parseStudioSubject(raw: string | null | undefined): StudioSubject | null {
  if (!raw) return null;
  const sepIdx = raw.indexOf(":");
  if (sepIdx <= 0 || sepIdx === raw.length - 1) return null;
  const kind = raw.slice(0, sepIdx);
  const id = raw.slice(sepIdx + 1);
  if (!isStudioSubjectKind(kind)) return null;
  if (!id.trim()) return null;
  return { kind, id };
}

/** Per-kind display copy for menu items / titles. Centralised so
 *  EntityVideos / action menus / wizard pre-fill strings stay consistent. */
export const STUDIO_SUBJECT_LABEL: Record<StudioSubjectKind, string> = {
  resume:         "Video Resume",
  profile:        "Video Profile",
  job:            "Video Job Ad",
  company:        "Video Company Promo",
  skills_demo:    "Video Skills Demo",
  creator_credit: "Portfolio Credit",
};

/** Plain-noun copy used when we want to say "this video is about a [X]"
 *  rather than "Video X". */
export const STUDIO_SUBJECT_NOUN: Record<StudioSubjectKind, string> = {
  resume:         "Resume",
  profile:        "Profile",
  job:            "Job",
  company:        "Company",
  skills_demo:    "Skills Demo",
  creator_credit: "Portfolio",
};

/** Build the route for "open the entity this video is about". Used by
 *  the active-project linkage chip and any other surface that wants to
 *  bounce from a video to its source entity. Skills demos don't have a
 *  standalone detail page yet — return null so callers can hide the
 *  link instead of routing to a dead URL. */
export function studioSubjectHref(subject: StudioSubject): string | null {
  switch (subject.kind) {
    case "resume":         return `/resumes/${subject.id}`;
    case "profile":        return `/people/${subject.id}`;
    case "job":            return `/jobs/${subject.id}`;
    case "company":        return `/companies/${subject.id}`;
    case "skills_demo":    return null;
    // creator_credit links to the contributor's profile — same destination
    // as `profile` but the subjectId here is the contributor's userId.
    case "creator_credit": return `/people/${subject.id}`;
  }
}
