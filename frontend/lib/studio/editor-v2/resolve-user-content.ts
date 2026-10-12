/**
 * resolveUserContent — single read path for "everything the user has
 * already created that a video template might need to render."
 *
 * Aggregates the user's profile (auth), their active résumé (incl. its
 * projects), and — only when the template's slot binders read them
 * (`TEMPLATE_BINDERS[id].sources`, template-content-slots.ts) — one owned job
 * posting, one owned company, and a few of their studio clips. Picker args
 * (`jobId` / `companyId` / `projectName` / `clipIds`) choose WHICH one; without
 * them the newest owned row is used. Skip-on-error is intentional — a missing
 * row or unauthenticated call shouldn't fail the whole pipeline; the slot
 * binder leaves the seed's text for the fields it can't resolve.
 */

import { authService, type UserProfile } from "@/lib/services/auth-service";
import { resumeService } from "@/lib/services/resume-service";
import { jobService } from "@/lib/services/job-service";
import { companyService } from "@/lib/services/company-service";
import { studioService } from "@/lib/services/studio-service";
import { publicCompanyPath, publicJobPath } from "@shared/public-paths";
import type { ResumeContent, Work, Skill, Basics, Project } from "@shared/resume";

/** Content families a template's binders read BEYOND the profile + résumé
 *  (which every template may read, so they always load). */
export type ContentSource = "job" | "company" | "clips";

export interface UserContentSnapshot {
  profile?: {
    name?: string;
    email?: string;
    headline?: string;
    bio?: string;
    currentRole?: string;
    currentCompany?: string;
    location?: string;
    yearsOfExperience?: number;
    /** Full public URL for the user's profile, when we can derive one. */
    publicProfileUrl?: string;
  };
  resume?: {
    id?: string;
    basics?: Basics;
    work?: Work[];
    skills?: Skill[];
    projects?: Project[];
  };
  /** The résumé project a showcase template features (picked by name, else
   *  the first named one). */
  project?: Project;
  /** One owned job posting (job_ad). */
  job?: {
    id: string;
    title: string;
    location?: string;
    responsibilities: string[];
    benefits: string[];
    salaryMin?: number;
    salaryMax?: number;
    currency?: string;
    /** Where "Apply" points: the posting's apply URL, else its public page. */
    applyUrl: string;
  };
  /** One owned company (company_promo). */
  company?: {
    id: string;
    name: string;
    industry?: string;
    size?: string;
    culture: string[];
    perks: string[];
    /** The company's site, else its public page. */
    url: string;
  };
  /** The studio clips a sizzle reel cuts together. */
  clips?: Array<{ id: string; title: string }>;
  /** The catalog tool a tool promo features (resolved by the tool runner). */
  tool?: { label: string; description: string; url: string };
}

/** Absolute URL for an in-app path (the slot text is shown off-site). */
function absoluteUrl(path: string): string {
  return `${typeof window !== "undefined" ? window.location.origin : ""}${path}`;
}

function profileToSnapshot(p: UserProfile): UserContentSnapshot["profile"] {
  const name = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || undefined;
  const publicProfileUrl = p.slug ? absoluteUrl(`/profile/${p.slug}`) : undefined;
  return {
    name,
    email: p.email,
    headline: p.headline,
    bio: p.bio,
    currentRole: p.currentRole,
    currentCompany: p.currentCompany,
    location: p.location,
    yearsOfExperience: p.yearsOfExperience,
    publicProfileUrl,
  };
}

function resumeToSnapshot(id: string, content: ResumeContent): UserContentSnapshot["resume"] {
  return { id, basics: content.basics, work: content.work, skills: content.skills, projects: content.projects };
}

/** Pick the resume to feed the template seed.
 *  - If `preferredResumeId` is supplied (the CHRO's bound resumeId), use it.
 *  - Otherwise, fall back to the user's primary/master/active resume.
 *  - If neither resolves, return undefined — the slot binder will skip the
 *    resume slots and the seed keeps its text.
 */
async function loadResume(
  preferredResumeId: string | undefined,
): Promise<UserContentSnapshot["resume"] | undefined> {
  try {
    if (preferredResumeId) {
      const r = await resumeService.getResumeById(preferredResumeId);
      const content = r?.content as ResumeContent | undefined;
      if (content) return resumeToSnapshot(r.id, content);
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
    return content ? resumeToSnapshot(r.id, content) : undefined;
  } catch {
    return undefined;
  }
}

const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);

async function loadJob(jobId: string | undefined): Promise<UserContentSnapshot["job"] | undefined> {
  try {
    const id = jobId ?? (await jobService.getMyPostedJobs())[0]?.id;
    if (!id) return undefined;
    const job = (await jobService.getJobById(id)) as Record<string, unknown> | null;
    if (!job || typeof job.title !== "string") return undefined;
    return {
      id,
      title: job.title,
      location: text(job.location),
      responsibilities: strs(job.responsibilities),
      benefits: strs(job.benefits),
      salaryMin: num(job.salaryMin),
      salaryMax: num(job.salaryMax),
      currency: text(job.salaryCurrency),
      applyUrl: text(job.applyUrl) ?? absoluteUrl(publicJobPath(id)),
    };
  } catch {
    return undefined;
  }
}

async function loadCompany(companyId: string | undefined): Promise<UserContentSnapshot["company"] | undefined> {
  try {
    const id = companyId ?? (await companyService.getMyCompanies())[0]?.id ?? undefined;
    if (!id) return undefined;
    const profile = await companyService.getCompanyProfileById(id);
    const d = profile.data;
    const notSpecified = (v: string | null | undefined) => (v && v !== "Not specified" ? v : undefined);
    return {
      id,
      name: d.name,
      industry: notSpecified(d.industry),
      size: notSpecified(d.size),
      culture: strs(d.culture),
      perks: strs(d.perks),
      url: text(d.website) ?? absoluteUrl(publicCompanyPath(profile.slug || id)),
    };
  } catch {
    return undefined;
  }
}

/** Up to three clips: the picked ones, else the newest video projects. */
async function loadClips(clipIds: readonly string[] | undefined): Promise<UserContentSnapshot["clips"]> {
  try {
    const res = await studioService.getProjects();
    const projects = res.data ?? [];
    const picked = clipIds?.length
      ? projects.filter((p) => clipIds.includes(p.id))
      : projects
          .filter((p) => p.mediaKind === "video")
          .sort((a, b) => b.updateDateTime.localeCompare(a.updateDateTime));
    return picked.slice(0, 3).map((p) => ({ id: p.id, title: p.title }));
  } catch {
    return undefined;
  }
}

/** The project a showcase template features: by name, else the first named. */
export function pickProject(projects: readonly Project[] | undefined, name?: string): Project | undefined {
  const named = (projects ?? []).filter((p) => p.name?.trim());
  const wanted = name?.trim().toLowerCase();
  return (wanted && named.find((p) => p.name.trim().toLowerCase() === wanted)) || named[0];
}

export interface ResolveUserContentInput {
  /** When the CHRO is invoked from a resume page, the panel binds the
   *  active resumeId — prefer it over the user's primary resume so the
   *  generated video reflects what the user was just looking at. */
  preferredResumeId?: string;
  /** Extra families to load (the template's binder sources). */
  sources?: readonly ContentSource[];
  /** Picker args — which owned job / company / résumé project / clips. */
  jobId?: string;
  companyId?: string;
  projectName?: string;
  clipIds?: readonly string[];
  /** The catalog tool a tool promo features (the runner resolves it). */
  tool?: UserContentSnapshot["tool"];
}

export async function resolveUserContent(
  input: ResolveUserContentInput = {},
): Promise<UserContentSnapshot> {
  const sources = new Set(input.sources ?? []);
  // Every binder may read the profile + résumé (names, roles, projects).
  const [profile, resume, job, company, clips] = await Promise.all([
    authService.getCurrentUser().then(profileToSnapshot).catch(() => undefined),
    loadResume(input.preferredResumeId),
    sources.has("job") ? loadJob(input.jobId) : Promise.resolve(undefined),
    sources.has("company") ? loadCompany(input.companyId) : Promise.resolve(undefined),
    sources.has("clips") ? loadClips(input.clipIds) : Promise.resolve(undefined),
  ]);
  return {
    profile,
    resume,
    project: pickProject(resume?.projects, input.projectName),
    ...(job ? { job } : {}),
    ...(company ? { company } : {}),
    ...(clips ? { clips } : {}),
    ...(input.tool ? { tool: input.tool } : {}),
  };
}
