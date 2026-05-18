/**
 * api-job-mapper — single source of truth for "given a raw API job
 * response, build the UIJob shape that the declarative job renderer
 * expects."
 *
 * Per the DRY rule: every page that paints a job through
 * `<DeclarativeJobRenderer/>` (today: `JobDetail`, the studio's
 * `JobInlineBody`) mounts this mapper. Adding a new surface that
 * shows a job is one import — no parallel "unwrap envelope, parse
 * jobSerialized, normalize benefits, …" branch elsewhere.
 *
 * Shape mirrors `DeclarativeJobRenderer`'s `RendererJobData` contract.
 * Both renderer and mapper deliberately accept partial / messy API
 * payloads — the editor preview shouldn't crash because one job row
 * has a string `industry` and another an array.
 */

export interface UIJobRequirement {
  skill: string;
  level: string;
  required: boolean;
}

export interface UIJobBenefit {
  type: string;
  description: string;
}

export interface UIJobCompany {
  name: string;
  logo?: string;
  description?: string;
  industry?: string;
  size?: string;
  website?: string;
}

export interface UIJobLocation {
  city?: string;
  state?: string;
  remote: boolean;
}

export interface UIJobData {
  title: string;
  description: string;
  company: UIJobCompany;
  location: UIJobLocation;
  videoUrl?: string;
  contactEmail?: string;
  applicationDeadline?: string;
  responsibilities: string[];
  requirements: UIJobRequirement[];
  qualifications: string[];
  benefits: UIJobBenefit[];
  employmentType?: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
}

export interface UIJob {
  id: string;
  status: "active" | "paused" | "closed" | "draft";
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  views: number;
  applications: number;
  userId?: string;
  /** Latest sentiment score from the Sentiment Analysis tool, null if
   *  the tool has not been run against this job. */
  sentimentScore?: number | null;
  data: UIJobData;
}

export function mapApiJobToUI(apiJob: any): UIJob {
  // If server returns envelope { success, data }, unwrap
  const j = apiJob?.data && apiJob.success !== undefined ? apiJob.data : apiJob;
  // Some jobs store serialized JSON in jobSerialized
  let parsed: any = {};
  try {
    if (
      typeof j.jobSerialized === "string" &&
      j.jobSerialized.trim().length > 0
    ) {
      parsed = JSON.parse(j.jobSerialized);
    }
  } catch {
    parsed = {};
  }
  return {
    id: (j.id || j.Id || "").toString(),
    status: ((j.status || j.Status) as UIJob["status"]) || "active",
    createdAt:
      j.createdAt ||
      j.creationDateTime ||
      j.postedDate ||
      new Date().toISOString(),
    updatedAt:
      j.updatedAt ||
      j.updateDateTime ||
      j.creationDateTime ||
      new Date().toISOString(),
    expiresAt: j.expiryDate || j.expirationDate,
    views: j.viewCount ?? 0,
    applications: j.applicationCount ?? 0,
    userId: j.createdBy || j.userId,
    sentimentScore: j.sentimentScore ?? null,
    data: {
      title: j.title || parsed.title || "",
      description: j.description || parsed.description || "",
      company: {
        name:
          j.company?.name || j.company || parsed.company || "Unknown Company",
        logo: j.companyLogo || j.company?.logoUrl || "",
        website: j.companyWebsite,
        description: j.companyDescription,
        industry:
          (Array.isArray(j.industry) ? j.industry[0] : j.industry) || undefined,
        size: j.size,
      },
      location: {
        remote: j.isRemote ?? false,
        city: j.city || j.address?.city || undefined,
        state: j.state || j.address?.stateProvince || undefined,
      },
      responsibilities: Array.isArray(j.responsibilities)
        ? j.responsibilities
        : Array.isArray(parsed.responsibilities)
          ? parsed.responsibilities
          : [],
      requirements: Array.isArray(j.requirements)
        ? j.requirements.map((r: string) => ({
            skill: r,
            level: "Intermediate",
            required: true,
          }))
        : [],
      qualifications: Array.isArray(j.qualifications) ? j.qualifications : [],
      benefits: Array.isArray(j.benefits)
        ? j.benefits.map((b: any) => ({
            type: b.type || "Benefit",
            description: b.description || "",
          }))
        : [],
      employmentType:
        (Array.isArray(j.employmentType)
          ? j.employmentType[0]
          : j.employmentType) || undefined,
      experienceLevel: j.experienceLevel,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      contactEmail: j.contactEmail,
      applicationDeadline: j.applicationDeadline,
    },
  };
}
