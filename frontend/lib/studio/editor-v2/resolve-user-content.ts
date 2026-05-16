/**
 * resolveUserContent — single read path for "everything the user has
 * already created that a video template might need to render."
 *
 * Aggregates the user's profile (auth) and their active resume into one
 * snapshot. Future content sources (voice clones, prior videos, owned
 * companies, owned jobs) bolt on here so every caller sees one shape
 * instead of three separate fetches. Skip-on-error is intentional — a
 * missing resume or unauthenticated profile call shouldn't fail the
 * whole pipeline; the slot binder degrades to placeholder text for the
 * fields it can't resolve.
 */

import { authService, type UserProfile } from "@/lib/services/auth-service";
import { resumeService } from "@/lib/services/resume-service";
import type { ResumeContent, Work, Skill, Basics } from "@shared/resume";

export interface UserContentSnapshot {
  profile?: {
    name?: string;
    email?: string;
    headline?: string;
    bio?: string;
    currentRole?: string;
    currentCompany?: string;
    yearsOfExperience?: number;
    /** Full public URL for the user's profile, when we can derive one. */
    publicProfileUrl?: string;
  };
  resume?: {
    id?: string;
    basics?: Basics;
    work?: Work[];
    skills?: Skill[];
  };
}

function profileToSnapshot(p: UserProfile): UserContentSnapshot["profile"] {
  const name = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || undefined;
  const publicProfileUrl = p.slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/profile/${p.slug}`
    : undefined;
  return {
    name,
    email: p.email,
    headline: p.headline,
    bio: p.bio,
    currentRole: p.currentRole,
    currentCompany: p.currentCompany,
    yearsOfExperience: p.yearsOfExperience,
    publicProfileUrl,
  };
}

/** Pick the resume to feed the template seed.
 *  - If `preferredResumeId` is supplied (the CHRO's bound resumeId), use it.
 *  - Otherwise, fall back to the user's primary/master/active resume.
 *  - If neither resolves, return undefined — the slot binder will skip the
 *    resume slots and the seed shows placeholder text.
 */
async function loadResume(
  preferredResumeId: string | undefined,
): Promise<UserContentSnapshot["resume"] | undefined> {
  try {
    if (preferredResumeId) {
      const r = await resumeService.getResumeById(preferredResumeId);
      const content = r?.content as ResumeContent | undefined;
      if (content) {
        return {
          id: r.id,
          basics: content.basics,
          work: content.work,
          skills: content.skills,
        };
      }
    }
    const list = await resumeService.getUserResumes();
    const pick =
      list.find((r) => r.isActive) ??
      list.find((r) => r.isMaster) ??
      list.find((r) => r.isPrimaryDefault) ??
      list[0];
    if (!pick?.id) return undefined;
    const r = await resumeService.getResumeById(pick.id);
    const content = r?.content as ResumeContent | undefined;
    if (!content) return undefined;
    return {
      id: r.id,
      basics: content.basics,
      work: content.work,
      skills: content.skills,
    };
  } catch {
    return undefined;
  }
}

export interface ResolveUserContentInput {
  /** When the CHRO is invoked from a resume page, the panel binds the
   *  active resumeId — prefer it over the user's primary resume so the
   *  generated video reflects what the user was just looking at. */
  preferredResumeId?: string;
}

export async function resolveUserContent(
  input: ResolveUserContentInput = {},
): Promise<UserContentSnapshot> {
  const [profile, resume] = await Promise.all([
    authService.getCurrentUser().then(profileToSnapshot).catch(() => undefined),
    loadResume(input.preferredResumeId),
  ]);
  return { profile, resume };
}
