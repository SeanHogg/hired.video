/**
 * Tests for the card-feed aggregator. The aggregator replaces the old unified
 * /api/search/public call by fanning out to the four per-domain public
 * endpoints and merging the results client-side — this is what delivers the
 * same card data fidelity on / and dashboard widgets as /resumes, /jobs, etc.
 *
 * Run: vitest run lib/__tests__/card-feed.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Every domain service the aggregator touches is mocked so the fanout
// behaviour is exercised in isolation. Forgetting one means the test
// will try to hit a real backend on localhost — see the studio mock,
// which was missed when /videos/public was added to fetchCardFeed.
vi.mock("@/lib/services/resume-service", () => ({
  resumeService: { getPublicResumes: vi.fn() },
}));
vi.mock("@/lib/services/job-service", () => ({
  jobService: { getPublicJobs: vi.fn() },
}));
vi.mock("@/lib/services/company-service", () => ({
  companyService: { getPublicCompanies: vi.fn() },
}));
vi.mock("@/lib/services/user-service", () => ({
  userService: { getPublicUsers: vi.fn() },
}));
vi.mock("@/lib/services/studio-service", () => ({
  studioService: { getPublicVideos: vi.fn() },
}));

import { fetchCardFeed, fetchCardFeedByType } from "@/lib/card-feed";
import { resumeService } from "@/lib/services/resume-service";
import { jobService } from "@/lib/services/job-service";
import { companyService } from "@/lib/services/company-service";
import { userService } from "@/lib/services/user-service";
import { studioService } from "@/lib/services/studio-service";

const getPublicResumes = resumeService.getPublicResumes as ReturnType<typeof vi.fn>;
const getPublicJobs = jobService.getPublicJobs as ReturnType<typeof vi.fn>;
const getPublicCompanies = companyService.getPublicCompanies as ReturnType<
  typeof vi.fn
>;
const getPublicUsers = userService.getPublicUsers as ReturnType<typeof vi.fn>;
const getPublicVideos = studioService.getPublicVideos as ReturnType<typeof vi.fn>;

// Small factories for each domain DTO shape — only the fields the aggregator reads.
const makeResume = (overrides: Record<string, unknown> = {}) => ({
  id: "r1",
  userId: "u1",
  name: "Resume One",
  title: "Resume One",
  description: "Professional summary",
  isOwner: false,
  privacy: "public",
  isMaster: true,
  isActive: false,
  parentId: null,
  views: 5,
  createdAt: "2026-04-10T00:00:00Z",
  updatedAt: "2026-04-10T00:00:00Z",
  ...overrides,
});

const makeJob = (overrides: Record<string, unknown> = {}) => ({
  id: "j1",
  userId: "u2",
  title: "Engineer",
  company: "Acme",
  location: "Remote",
  summary: "Build things",
  employmentType: "Full-time",
  experienceLevel: "senior",
  salary: "$150k",
  views: 0,
  applications: 0,
  createdAt: "2026-04-12T00:00:00Z",
  ...overrides,
});

const makeCompany = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  name: "Acme",
  description: "Tagline",
  industry: "Tech",
  size: "50-200",
  location: "Detroit",
  logo: "https://cdn/logo.png",
  activeJobCount: 3,
  followers: 10,
  status: "active",
  views: 0,
  createdAt: "2026-04-11T00:00:00Z",
  ...overrides,
});

const makePerson = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  fullName: "Sean Hogg",
  headline: "CTO",
  avatar: "https://cdn/avatar.png",
  location: "Troy, MI",
  role: "job_seeker",
  currentCompany: "Independent",
  openToWork: true,
  emailConfirmed: true,
  slug: "sean-hogg",
  views: 0,
  createdAt: "2026-04-13T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  getPublicResumes.mockResolvedValue({
    items: [makeResume()],
    total: 1,
    page: 1,
    limit: 8,
    hasNext: false,
    hasPrev: false,
  });
  getPublicJobs.mockResolvedValue({
    items: [makeJob()],
    total: 1,
    page: 1,
    limit: 8,
    hasNext: false,
    hasPrev: false,
  });
  getPublicCompanies.mockResolvedValue({
    items: [makeCompany()],
    total: 1,
    page: 1,
    limit: 8,
  });
  getPublicUsers.mockResolvedValue({
    items: [makePerson()],
    total: 1,
    page: 1,
    limit: 8,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  getPublicVideos.mockResolvedValue({ data: [] });
});

describe("fetchCardFeed — fanout", () => {
  it("calls every domain service when types omitted", async () => {
    await fetchCardFeed();
    expect(getPublicResumes).toHaveBeenCalledTimes(1);
    expect(getPublicJobs).toHaveBeenCalledTimes(1);
    expect(getPublicCompanies).toHaveBeenCalledTimes(1);
    expect(getPublicUsers).toHaveBeenCalledTimes(1);
    expect(getPublicVideos).toHaveBeenCalledTimes(1);
  });

  it("only calls the requested services when types is restricted", async () => {
    await fetchCardFeed({ types: ["resume"] });
    expect(getPublicResumes).toHaveBeenCalledTimes(1);
    expect(getPublicJobs).not.toHaveBeenCalled();
    expect(getPublicCompanies).not.toHaveBeenCalled();
    expect(getPublicUsers).not.toHaveBeenCalled();
    expect(getPublicVideos).not.toHaveBeenCalled();
  });

  it("returns a sortable card per item with the shared sortKey", async () => {
    const feed = await fetchCardFeed({ types: ["resume"] });
    expect(feed.items).toHaveLength(1);
    const card = feed.items[0];
    expect(card.type).toBe("resume");
    expect(card.sortKey).toEqual({
      createdAt: "2026-04-10T00:00:00Z",
      views: 5,
      featured: false,
    });
  });
});

describe("fetchCardFeed — resume canonicalization", () => {
  it("maps description → summary so normalizers find the professional summary", async () => {
    getPublicResumes.mockResolvedValueOnce({
      items: [makeResume({ description: "my summary", summary: undefined })],
      total: 1,
      page: 1,
      limit: 8,
      hasNext: false,
      hasPrev: false,
    });
    const feed = await fetchCardFeed({ types: ["resume"] });
    expect(feed.items[0].summary).toBe("my summary");
  });

  it("carries userId through so downstream ownership detection works", async () => {
    getPublicResumes.mockResolvedValueOnce({
      items: [makeResume({ userId: "user-42" })],
      total: 1,
      page: 1,
      limit: 8,
      hasNext: false,
      hasPrev: false,
    });
    const feed = await fetchCardFeed({ types: ["resume"] });
    expect(feed.items[0].userId).toBe("user-42");
  });

  it("carries isMaster / isActive / parentId / privacy through", async () => {
    getPublicResumes.mockResolvedValueOnce({
      items: [
        makeResume({
          isMaster: false,
          isActive: true,
          parentId: "p1",
          privacy: "recruiter_only",
        }),
      ],
      total: 1,
      page: 1,
      limit: 8,
      hasNext: false,
      hasPrev: false,
    });
    const feed = await fetchCardFeed({ types: ["resume"] });
    const r = feed.items[0];
    expect(r.isMaster).toBe(false);
    expect(r.isActive).toBe(true);
    expect(r.parentId).toBe("p1");
    expect(r.privacy).toBe("recruiter_only");
  });
});

describe("fetchCardFeed — sorting", () => {
  it('sorts "recent" by createdAt descending across types', async () => {
    getPublicResumes.mockResolvedValueOnce({
      items: [makeResume({ id: "r-old", createdAt: "2026-01-01T00:00:00Z" })],
      total: 1,
      page: 1,
      limit: 8,
      hasNext: false,
      hasPrev: false,
    });
    getPublicJobs.mockResolvedValueOnce({
      items: [makeJob({ id: "j-new", createdAt: "2026-04-14T00:00:00Z" })],
      total: 1,
      page: 1,
      limit: 8,
      hasNext: false,
      hasPrev: false,
    });
    const feed = await fetchCardFeed({ types: ["resume", "job"], sort: "recent" });
    expect(feed.items.map((i) => i.id)).toEqual(["j-new", "r-old"]);
  });

  it('sorts "top" by views descending', async () => {
    getPublicResumes.mockResolvedValueOnce({
      items: [
        makeResume({ id: "r-hot", views: 500 }),
        makeResume({ id: "r-cold", views: 1 }),
      ],
      total: 2,
      page: 1,
      limit: 8,
      hasNext: false,
      hasPrev: false,
    });
    const feed = await fetchCardFeed({ types: ["resume"], sort: "top" });
    expect(feed.items.map((i) => i.id)).toEqual(["r-hot", "r-cold"]);
  });

  it('sorts "featured" items first, then recent among ties', async () => {
    getPublicResumes.mockResolvedValueOnce({
      items: [
        makeResume({ id: "r-plain", createdAt: "2026-04-14T00:00:00Z" }),
        makeResume({
          id: "r-featured",
          createdAt: "2026-01-01T00:00:00Z",
          isFeatured: true,
        }),
      ],
      total: 2,
      page: 1,
      limit: 8,
      hasNext: false,
      hasPrev: false,
    });
    const feed = await fetchCardFeed({ types: ["resume"], sort: "featured" });
    expect(feed.items[0].id).toBe("r-featured");
  });
});

describe("fetchCardFeed — resilience", () => {
  it("returns empty items for a type whose service throws (doesn't poison the feed)", async () => {
    getPublicResumes.mockRejectedValueOnce(new Error("backend blew up"));
    const feed = await fetchCardFeed({ types: ["resume", "job"] });
    // Resume errored → job survives
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].type).toBe("job");
  });
});

describe("fetchCardFeedByType", () => {
  it("is a thin wrapper that only hits the requested domain", async () => {
    await fetchCardFeedByType("company", { limitPerType: 5 });
    expect(getPublicCompanies).toHaveBeenCalledTimes(1);
    expect(getPublicResumes).not.toHaveBeenCalled();
  });
});
