/**
 * #689 — resolveUserContent loads only the content families a template's
 * binders read, honours the picker args, and degrades to "no content" on a
 * failed read instead of failing the whole tool run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const getUserResumes = vi.fn();
const getResumeById = vi.fn();
const getMyPostedJobs = vi.fn();
const getJobById = vi.fn();
const getMyCompanies = vi.fn();
const getCompanyProfileById = vi.fn();
const getProjects = vi.fn();

vi.mock("@/lib/services/auth-service", () => ({ authService: { getCurrentUser: () => getCurrentUser() } }));
vi.mock("@/lib/services/resume-service", () => ({
  resumeService: { getUserResumes: () => getUserResumes(), getResumeById: (id: string) => getResumeById(id) },
}));
vi.mock("@/lib/services/job-service", () => ({
  jobService: { getMyPostedJobs: () => getMyPostedJobs(), getJobById: (id: string) => getJobById(id) },
}));
vi.mock("@/lib/services/company-service", () => ({
  companyService: {
    getMyCompanies: () => getMyCompanies(),
    getCompanyProfileById: (id: string) => getCompanyProfileById(id),
  },
}));
vi.mock("@/lib/services/studio-service", () => ({ studioService: { getProjects: () => getProjects() } }));

import { pickProject, resolveUserContent } from "../resolve-user-content";

const RESUME_ID = "8b6f2c1e-0d6a-4b8e-9f3a-2c7d5e1a9b40";
const JOB_ID = "4f1c9a2b-7e3d-4c8a-b6f0-1d2e3a4b5c6d";
const OTHER_JOB_ID = "0a9b8c7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ firstName: "Gordon", lastName: "Okafor", email: "g@example.com", slug: "gordon-okafor" });
  getUserResumes.mockResolvedValue([{ id: RESUME_ID, isMaster: true }]);
  getResumeById.mockResolvedValue({
    id: RESUME_ID,
    content: {
      basics: { name: "Gordon Okafor", label: "Senior Product Manager" },
      work: [],
      skills: [],
      projects: [
        { name: "", description: "untitled draft" },
        { name: "Checkout Insights", description: "Funnel analytics." },
        { name: "Tax Flow", description: "Guided filing." },
      ],
    },
  });
  getMyPostedJobs.mockResolvedValue([{ id: OTHER_JOB_ID, title: "Newest posting" }]);
  getJobById.mockImplementation(async (id: string) => ({
    id,
    title: id === JOB_ID ? "Staff Product Manager" : "Newest posting",
    location: "Remote (Canada)",
    responsibilities: ["Own onboarding", ""],
    benefits: ["Equity"],
    salaryMin: 170000,
    salaryMax: 210000,
    salaryCurrency: "CAD",
    applyUrl: null,
  }));
  getMyCompanies.mockResolvedValue([{ id: "co-1" }]);
  getCompanyProfileById.mockResolvedValue({
    id: "co-1",
    slug: "northwind-labs",
    data: { name: "Northwind Labs", industry: "Not specified", size: "51-200", culture: ["Write it down"], perks: [], website: null },
  });
  getProjects.mockResolvedValue({
    data: [
      { id: "p-old", title: "Old cut", mediaKind: "video", updateDateTime: "2026-01-01T00:00:00Z" },
      { id: "p-doc", title: "A document", mediaKind: "document", updateDateTime: "2026-09-01T00:00:00Z" },
      { id: "p-new", title: "Launch keynote", mediaKind: "video", updateDateTime: "2026-08-01T00:00:00Z" },
    ],
  });
});

describe("resolveUserContent", () => {
  it("loads only profile + résumé by default (no job / company / clip reads)", async () => {
    const uc = await resolveUserContent();
    expect(uc.profile?.name).toBe("Gordon Okafor");
    expect(uc.resume?.id).toBe(RESUME_ID);
    expect(uc.job).toBeUndefined();
    expect(getMyPostedJobs).not.toHaveBeenCalled();
    expect(getMyCompanies).not.toHaveBeenCalled();
    expect(getProjects).not.toHaveBeenCalled();
  });

  it("features the picked job, falling back to its public page for apply", async () => {
    const uc = await resolveUserContent({ sources: ["job"], jobId: JOB_ID });
    expect(uc.job?.title).toBe("Staff Product Manager");
    expect(uc.job?.responsibilities).toEqual(["Own onboarding"]);
    expect(uc.job?.applyUrl).toMatch(new RegExp(`/jobs/${JOB_ID}$`));
    expect(getMyPostedJobs).not.toHaveBeenCalled();
  });

  it("without a pick, features the newest posted job", async () => {
    const uc = await resolveUserContent({ sources: ["job"] });
    expect(getJobById).toHaveBeenCalledWith(OTHER_JOB_ID);
    expect(uc.job?.title).toBe("Newest posting");
  });

  it("reads the owned company, treating the API's 'Not specified' default as empty", async () => {
    const uc = await resolveUserContent({ sources: ["company"] });
    expect(uc.company).toMatchObject({ name: "Northwind Labs", size: "51-200", culture: ["Write it down"] });
    expect(uc.company?.industry).toBeUndefined();
    expect(uc.company?.url).toMatch(/\/companies\/northwind-labs$/);
  });

  it("clips: the newest video projects, never a document", async () => {
    const uc = await resolveUserContent({ sources: ["clips"] });
    expect(uc.clips?.map((c) => c.id)).toEqual(["p-new", "p-old"]);
  });

  it("a failed read leaves that family empty instead of failing the run", async () => {
    getMyPostedJobs.mockRejectedValue(new Error("401"));
    getCurrentUser.mockRejectedValue(new Error("401"));
    const uc = await resolveUserContent({ sources: ["job"] });
    expect(uc.job).toBeUndefined();
    expect(uc.profile).toBeUndefined();
    expect(uc.resume?.id).toBe(RESUME_ID);
  });

  it("picks the featured project by name, else the first named one", async () => {
    const byName = await resolveUserContent({ projectName: "tax flow" });
    expect(byName.project?.name).toBe("Tax Flow");
    const first = await resolveUserContent();
    expect(first.project?.name).toBe("Checkout Insights");
  });
});

describe("pickProject", () => {
  it("is undefined for a résumé with no named projects", () => {
    expect(pickProject(undefined)).toBeUndefined();
    expect(pickProject([{ name: "  " } as never])).toBeUndefined();
  });
});
