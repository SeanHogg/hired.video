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

import { publicCompanyPath, publicJobPath, publicProfilePath, publicResumePath } from "./public-paths.js";

export const STUDIO_SUBJECT_KINDS = [
  "resume",
  "profile",
  "job",
  "company",
  "skills_demo",
  // #325 — articles are part of the "Studio promotes Jobs, Companies,
  // Articles, Profiles, Resumes" product direction. EntityVideos on an
  // article surface lets the author promote their long-form content
  // with a video clip; routing lands on `/blog/:slug`.
  "article",
  // The actor (delegate / contributor / video editor) credited for
  // producing the video on behalf of the subject. Lets a contractor
  // surface delegated work on their own portfolio page even though
  // ownership of the asset stays with the subject (per the workspace
  // model in services/studio/workspace.ts). The EntityVideos scroller
  // on a profile picks this up automatically.
  "creator_credit",
  // THE video of a résumé made in the kit workspace (one per résumé).
  // Rides beside the plain "resume" link: "resume" says what a video is
  // ABOUT (many videos can be), "resume_video" says which one the kit workspace owns
  // and posts — so its Post dock updates that project on every visit
  // instead of saving a copy, and the studio's "Your kits" list can show a
  // résumé's video without guessing. A studio-made video about the same
  // résumé is never overwritten.
  "resume_video",
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
 *  EntityMedia / action menus / wizard pre-fill strings stay consistent.
 *
 *  Drops the "Video" prefix that was baked in when the studio was
 *  video-only — any mediaKind (image / game / animation / podcast /
 *  cad / comic) can now be linked to any entity, so the chip and
 *  menu copy must read as "create something for this resume / profile
 *  / job / …", not "create a video for it". "Reel" is the short
 *  industry-noun for a self-promotional clip and reads cleanly across
 *  all mediaKinds (a Photoshop image, a podcast episode, a memory-
 *  match game are all "the candidate's resume reel"). Skills demo /
 *  article promo / portfolio credit keep their pre-existing nouns
 *  because they were already kind-neutral. */
export const STUDIO_SUBJECT_LABEL: Record<StudioSubjectKind, string> = {
  resume:         "Resume Reel",
  profile:        "Profile Reel",
  job:            "Job Reel",
  company:        "Company Reel",
  skills_demo:    "Skills Demo",
  article:        "Article Promo",
  creator_credit: "Portfolio Credit",
  resume_video:   "Resume Video",
};

/** Plain-noun copy used when we want to say "this video is about a [X]"
 *  rather than "Video X". */
export const STUDIO_SUBJECT_NOUN: Record<StudioSubjectKind, string> = {
  resume:         "Resume",
  profile:        "Profile",
  job:            "Job",
  company:        "Company",
  skills_demo:    "Skills Demo",
  article:        "Article",
  creator_credit: "Portfolio",
  resume_video:   "Resume",
};

/** Build the route for "open the entity this video is about". Used by
 *  the active-project linkage chip and any other surface that wants to
 *  bounce from a video to its source entity. Skills demos don't have a
 *  standalone detail page yet — return null so callers can hide the
 *  link instead of routing to a dead URL. */
export function studioSubjectHref(subject: StudioSubject): string | null {
  switch (subject.kind) {
    case "resume":         return publicResumePath(subject.id);
    case "profile":        return publicProfilePath(subject.id);
    case "job":            return publicJobPath(subject.id);
    case "company":        return publicCompanyPath(subject.id);
    case "skills_demo":    return null;
    // The subject id for articles is the article slug (not a UUID); the
    // public blog route renders the same content as `/articles/...`.
    case "article":        return `/blog/${subject.id}`;
    // creator_credit links to the contributor's profile — same destination
    // as `profile` but the subjectId here is the contributor's userId.
    case "creator_credit": return publicProfilePath(subject.id);
    // The résumé's kit (résumé + letter + video) opens in the workspace.
    case "resume_video":   return `/studio/resume/${encodeURIComponent(subject.id)}`;
  }
}

/** The résumé a kit project is about (its `resume_video` link), or null
 *  for any other project — the ONE test for "is this project a kit?". */
export function kitResumeId(subjects: readonly { kind: string; id: string }[] | null | undefined): string | null {
  return subjects?.find((s) => s.kind === "resume_video")?.id ?? null;
}

/** The links a kit video carries: `save` = what it is about (the résumé)
 *  plus that it is the résumé's own kit video; `reuse` = the link that
 *  finds THAT project again on a later visit. */
export function resumeVideoLinks(resumeId: string): { save: StudioSubject[]; reuse: StudioSubject } {
  const reuse: StudioSubject = { kind: "resume_video", id: resumeId };
  return { save: [{ kind: "resume", id: resumeId }, reuse], reuse };
}
