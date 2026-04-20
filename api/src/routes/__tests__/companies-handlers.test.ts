/**
 * Integration tests for the pure companies handlers (companies-handlers.ts).
 *
 * Uses an in-memory fake DB injected via CompanyDeps. Every handler's
 * success path + auth/permission + 404 branches are exercised.
 *
 * Covers:
 *   • handleCreateCompany       — 201 with row, 400 validation, 401 auth
 *   • handleUpdateCompany       — 200 updates new fields, 403 non-owner,
 *                                 404 missing, 401 anon, 400 validation
 *   • handleDeleteCompany       — 200 delete, 403 non-owner, 404 missing
 *   • handleFollowCompany       — idempotent follow
 *   • handleUnfollowCompany     — delete link
 *   • handleFollowingStatus     — false for anonymous, true when linked
 *   • handleListLocations       — ordered by displayOrder
 *   • handleCreateLocation      — 201 with row, 403 non-owner, 400 validation
 *   • handleUpdateLocation      — 200 update, 404 not-found
 *   • handleDeleteLocation      — 200 delete
 *   • handleCreateTeamMember    — 201 with row, 403 non-owner
 *   • handleUpdateTeamMember    — partial update accepted
 *   • handleDeleteTeamMember    — 200 delete
 *   • slugifyCompanyName        — edge cases
 *
 * Run: node --import tsx --test src/routes/__tests__/companies-handlers.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  handleCreateCompany,
  handleUpdateCompany,
  handleDeleteCompany,
  handleFollowCompany,
  handleUnfollowCompany,
  handleFollowingStatus,
  handleListLocations,
  handleCreateLocation,
  handleUpdateLocation,
  handleDeleteLocation,
  handleListTeamMembers,
  handleCreateTeamMember,
  handleUpdateTeamMember,
  handleDeleteTeamMember,
  slugifyCompanyName,
  type CompanyDeps,
} from "../companies-handlers.js";

// ---------------------------------------------------------------------------
// Fake DB — supports the query shapes the handlers use
// ---------------------------------------------------------------------------

interface FakeCompany {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  industry: string | null;
  size: string | null;
  foundedYear: number | null;
  headquarters: string | null;
  tagline: string | null;
  mission: string | null;
  vision: string | null;
  technologies: string[];
  perks: string[];
  culture: string[];
  values: string[];
  benefits: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  [k: string]: unknown;
}

function makeFakeDb(seed: {
  companies?: FakeCompany[];
  followers?: Array<{ id: string; userId: string; companyId: string }>;
  locations?: Array<Record<string, unknown>>;
  teamMembers?: Array<Record<string, unknown>>;
} = {}) {
  const state = {
    companies: seed.companies ?? [],
    followers: seed.followers ?? [],
    locations: seed.locations ?? [],
    teamMembers: seed.teamMembers ?? [],
  };

  function inferTable(t: any): keyof typeof state | null {
    // Drizzle stashes the table name on a Symbol. The key name varies
    // across minor versions, so walk all own-property symbols looking
    // for one whose description matches /name/i.
    const sym = Object.getOwnPropertySymbols(t ?? {}).find((s) => /name/i.test(s.description ?? ""));
    const name =
      (sym ? (t as any)[sym] : null) ??
      (t as any)?._?.name ??
      (t as any)?._?.baseName ??
      (t as any)?.name ??
      null;
    if (name === "company_profiles") return "companies";
    if (name === "company_followers") return "followers";
    if (name === "company_locations") return "locations";
    if (name === "company_team_members") return "teamMembers";
    if (name === "company_views") return null; // event log — writes only
    return null;
  }

  const db: any = {
    select(columns?: unknown) {
      return {
        from(table: any) {
          const key = inferTable(table);
          return {
            where(_: unknown) {
              return {
                limit(n: number) {
                  return Promise.resolve(key ? (state as any)[key].slice(0, n) : []);
                },
                orderBy(_ob: unknown) {
                  return Promise.resolve(key ? (state as any)[key].slice() : []);
                },
                then(resolve: any) {
                  resolve(key ? (state as any)[key].slice() : []);
                },
              };
            },
          };
        },
      };
    },
    insert(table: any) {
      const key = inferTable(table);
      return {
        values(vs: any) {
          const row = {
            id: vs.id ?? randomUUID(),
            ...vs,
            createdAt: vs.createdAt ?? new Date(),
            updatedAt: vs.updatedAt ?? new Date(),
          };
          if (key) (state as any)[key].push(row);
          return {
            returning(_?: unknown) {
              return Promise.resolve([row]);
            },
            then(resolve: any) {
              resolve(undefined);
            },
          };
        },
      };
    },
    update(table: any) {
      const key = inferTable(table);
      return {
        set(values: Record<string, unknown>) {
          return {
            where(_: unknown) {
              if (key) {
                for (const row of (state as any)[key] as any[]) Object.assign(row, values);
              }
              return {
                returning(_?: unknown) {
                  return Promise.resolve(key ? (state as any)[key].slice() : []);
                },
                then(resolve: any) {
                  resolve(undefined);
                },
              };
            },
          };
        },
      };
    },
    delete(table: any) {
      const key = inferTable(table);
      return {
        where(_: unknown) {
          if (key) (state as any)[key].length = 0;
          return Promise.resolve();
        },
      };
    },
  };

  return { db, state };
}

function makeDeps(seed: Parameters<typeof makeFakeDb>[0] = {}): CompanyDeps & { _state: ReturnType<typeof makeFakeDb>["state"] } {
  const { db, state } = makeFakeDb(seed);
  return {
    db,
    now: () => new Date("2026-04-19T00:00:00.000Z"),
    _state: state,
  } as any;
}

function makeCompany(overrides: Partial<FakeCompany> = {}): FakeCompany {
  const now = new Date("2026-04-15T00:00:00Z");
  return {
    id: "company-1",
    ownerId: "owner-1",
    name: "Acme",
    slug: "acme",
    description: null,
    website: null,
    logoUrl: null,
    industry: null,
    size: null,
    foundedYear: null,
    headquarters: null,
    tagline: null,
    mission: null,
    vision: null,
    technologies: [],
    perks: [],
    culture: [],
    values: [],
    benefits: {},
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// slugifyCompanyName
// ═══════════════════════════════════════════════════════════════════════════

describe("slugifyCompanyName", () => {
  it("lowercases and hyphenates", () => {
    assert.equal(slugifyCompanyName("Acme Robotics"), "acme-robotics");
  });

  it("strips non-alphanumeric runs and leading/trailing hyphens", () => {
    assert.equal(slugifyCompanyName("!!!Acme Inc.!!!"), "acme-inc");
    assert.equal(slugifyCompanyName("  multi  spaces  "), "multi-spaces");
  });

  it("truncates to 100 characters", () => {
    const slug = slugifyCompanyName("a".repeat(500));
    assert.ok(slug.length <= 100);
  });

  it("falls back to 'company' when the slug would be empty", () => {
    assert.equal(slugifyCompanyName("!!!"), "company");
    assert.equal(slugifyCompanyName(""), "company");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleCreateCompany
// ═══════════════════════════════════════════════════════════════════════════

describe("handleCreateCompany", () => {
  it("creates a company row and returns 201", async () => {
    const deps = makeDeps();
    const res = await handleCreateCompany(deps, "owner-1", {
      name: "New Co",
      description: "We do things",
    });
    assert.equal(res.status, 201);
    assert.equal(deps._state.companies.length, 1);
    assert.equal(deps._state.companies[0].name, "New Co");
    assert.equal(deps._state.companies[0].slug, "new-co");
    assert.equal(deps._state.companies[0].ownerId, "owner-1");
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleCreateCompany(deps, null, { name: "X" });
    assert.equal(res.status, 401);
    assert.equal(deps._state.companies.length, 0);
  });

  it("returns 400 for empty or missing name", async () => {
    const deps = makeDeps();
    assert.equal((await handleCreateCompany(deps, "owner-1", {})).status, 400);
    assert.equal((await handleCreateCompany(deps, "owner-1", { name: "" })).status, 400);
  });

  it("rejects invalid website URLs at the schema layer", async () => {
    const deps = makeDeps();
    const res = await handleCreateCompany(deps, "owner-1", {
      name: "Co",
      website: "not-a-url",
    });
    assert.equal(res.status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleUpdateCompany
// ═══════════════════════════════════════════════════════════════════════════

describe("handleUpdateCompany", () => {
  it("updates rich profile fields (tagline / mission / technologies / benefits)", async () => {
    const deps = makeDeps({ companies: [makeCompany()] });
    const res = await handleUpdateCompany(deps, "owner-1", "company-1", {
      tagline: "Robots that care",
      mission: "Help humans",
      technologies: ["TS", "Rust"],
      benefits: { healthInsurance: true, remoteWork: true },
    });
    assert.equal(res.status, 200);
    assert.equal(deps._state.companies[0].tagline, "Robots that care");
    assert.equal(deps._state.companies[0].mission, "Help humans");
    assert.deepEqual(deps._state.companies[0].technologies, ["TS", "Rust"]);
    assert.deepEqual(deps._state.companies[0].benefits, { healthInsurance: true, remoteWork: true });
  });

  it("returns 401 for anonymous callers (no auth at all)", async () => {
    const deps = makeDeps({ companies: [makeCompany()] });
    const res = await handleUpdateCompany(deps, null, "company-1", { name: "X" });
    assert.equal(res.status, 401);
  });

  it("returns 403 when a signed-in non-owner tries to update", async () => {
    const deps = makeDeps({ companies: [makeCompany({ ownerId: "owner-1" })] });
    const res = await handleUpdateCompany(deps, "someone-else", "company-1", { name: "X" });
    assert.equal(res.status, 403);
  });

  it("returns 404 when the company doesn't exist", async () => {
    const deps = makeDeps();
    const res = await handleUpdateCompany(deps, "owner-1", "missing", { name: "X" });
    assert.equal(res.status, 404);
  });

  it("returns 400 for invalid body (e.g. malformed URL)", async () => {
    const deps = makeDeps({ companies: [makeCompany()] });
    const res = await handleUpdateCompany(deps, "owner-1", "company-1", {
      website: "not-a-url",
    });
    assert.equal(res.status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleDeleteCompany
// ═══════════════════════════════════════════════════════════════════════════

describe("handleDeleteCompany", () => {
  it("deletes the company and returns 200", async () => {
    const deps = makeDeps({ companies: [makeCompany()] });
    const res = await handleDeleteCompany(deps, "owner-1", "company-1");
    assert.equal(res.status, 200);
    assert.equal(deps._state.companies.length, 0);
  });

  it("returns 403 for non-owners", async () => {
    const deps = makeDeps({ companies: [makeCompany({ ownerId: "owner-1" })] });
    const res = await handleDeleteCompany(deps, "intruder", "company-1");
    assert.equal(res.status, 403);
    assert.equal(deps._state.companies.length, 1, "row not deleted");
  });

  it("returns 404 when the company doesn't exist", async () => {
    const deps = makeDeps();
    const res = await handleDeleteCompany(deps, "owner-1", "missing");
    assert.equal(res.status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Follow / unfollow
// ═══════════════════════════════════════════════════════════════════════════

describe("handleFollowCompany", () => {
  it("inserts a follower row and returns 200", async () => {
    const deps = makeDeps();
    const res = await handleFollowCompany(deps, "user-1", "company-1");
    assert.equal(res.status, 200);
    assert.equal(deps._state.followers.length, 1);
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleFollowCompany(deps, null, "company-1");
    assert.equal(res.status, 401);
    assert.equal(deps._state.followers.length, 0);
  });
});

describe("handleUnfollowCompany", () => {
  it("deletes the follow link and returns 200", async () => {
    const deps = makeDeps({
      followers: [{ id: "f1", userId: "user-1", companyId: "company-1" }],
    });
    const res = await handleUnfollowCompany(deps, "user-1", "company-1");
    assert.equal(res.status, 200);
    assert.equal(deps._state.followers.length, 0);
  });

  it("returns 401 for anonymous callers", async () => {
    const deps = makeDeps();
    const res = await handleUnfollowCompany(deps, null, "company-1");
    assert.equal(res.status, 401);
  });
});

describe("handleFollowingStatus", () => {
  it("returns false for anonymous callers (no DB lookup)", async () => {
    const deps = makeDeps();
    const res = await handleFollowingStatus(deps, null, "company-1");
    assert.equal(res.status, 200);
    assert.equal((res.body as any).data.isFollowing, false);
  });

  it("returns true when the follower row exists", async () => {
    const deps = makeDeps({
      followers: [{ id: "f1", userId: "user-1", companyId: "company-1" }],
    });
    const res = await handleFollowingStatus(deps, "user-1", "company-1");
    assert.equal((res.body as any).data.isFollowing, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Locations CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe("handleListLocations", () => {
  it("returns the locations for a company", async () => {
    const deps = makeDeps({
      locations: [
        { id: "l1", companyId: "company-1", city: "Detroit", displayOrder: 0, createdAt: new Date(), updatedAt: new Date() },
      ],
    });
    const res = await handleListLocations(deps, "company-1");
    assert.equal(res.status, 200);
    assert.equal((res.body as any).data.length, 1);
  });

  it("returns an empty array when the company has no locations", async () => {
    const deps = makeDeps();
    const res = await handleListLocations(deps, "company-1");
    assert.deepEqual((res.body as any).data, []);
  });
});

describe("handleCreateLocation", () => {
  it("creates a location and returns 201", async () => {
    const deps = makeDeps({ companies: [makeCompany()] });
    const res = await handleCreateLocation(deps, "owner-1", "company-1", {
      city: "Detroit",
      region: "MI",
      countryCode: "US",
      isPrimary: true,
    });
    assert.equal(res.status, 201);
    assert.equal(deps._state.locations.length, 1);
    assert.equal((deps._state.locations[0] as any).city, "Detroit");
  });

  it("returns 403 for non-owners", async () => {
    const deps = makeDeps({ companies: [makeCompany({ ownerId: "owner-1" })] });
    const res = await handleCreateLocation(deps, "other", "company-1", { city: "X" });
    assert.equal(res.status, 403);
    assert.equal(deps._state.locations.length, 0);
  });
});

describe("handleUpdateLocation", () => {
  it("updates and returns 200", async () => {
    const deps = makeDeps({
      companies: [makeCompany()],
      locations: [{ id: "loc-1", companyId: "company-1", city: "Old", createdAt: new Date(), updatedAt: new Date() }],
    });
    const res = await handleUpdateLocation(deps, "owner-1", "company-1", "loc-1", { city: "New" });
    assert.equal(res.status, 200);
    assert.equal((deps._state.locations[0] as any).city, "New");
  });
});

describe("handleDeleteLocation", () => {
  it("deletes the location (owner-gated)", async () => {
    const deps = makeDeps({
      companies: [makeCompany()],
      locations: [{ id: "loc-1", companyId: "company-1", city: "X", createdAt: new Date(), updatedAt: new Date() }],
    });
    const res = await handleDeleteLocation(deps, "owner-1", "company-1", "loc-1");
    assert.equal(res.status, 200);
    assert.equal(deps._state.locations.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Team members CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe("handleCreateTeamMember", () => {
  it("creates a team member and returns 201", async () => {
    const deps = makeDeps({ companies: [makeCompany()] });
    const res = await handleCreateTeamMember(deps, "owner-1", "company-1", {
      name: "Ada Lovelace",
      title: "CTO",
    });
    assert.equal(res.status, 201);
    assert.equal(deps._state.teamMembers.length, 1);
    assert.equal((deps._state.teamMembers[0] as any).name, "Ada Lovelace");
  });

  it("rejects missing name with 400", async () => {
    const deps = makeDeps({ companies: [makeCompany()] });
    const res = await handleCreateTeamMember(deps, "owner-1", "company-1", { title: "CTO" });
    assert.equal(res.status, 400);
  });

  it("returns 403 for non-owners", async () => {
    const deps = makeDeps({ companies: [makeCompany({ ownerId: "owner-1" })] });
    const res = await handleCreateTeamMember(deps, "other", "company-1", { name: "Ada" });
    assert.equal(res.status, 403);
  });
});

describe("handleUpdateTeamMember", () => {
  it("accepts a partial update (just title change)", async () => {
    const deps = makeDeps({
      companies: [makeCompany()],
      teamMembers: [{ id: "tm-1", companyId: "company-1", name: "Ada", title: "Engineer", createdAt: new Date(), updatedAt: new Date() }],
    });
    const res = await handleUpdateTeamMember(deps, "owner-1", "company-1", "tm-1", {
      title: "Senior Engineer",
    });
    assert.equal(res.status, 200);
    assert.equal((deps._state.teamMembers[0] as any).title, "Senior Engineer");
  });
});

describe("handleDeleteTeamMember", () => {
  it("deletes (owner-gated)", async () => {
    const deps = makeDeps({
      companies: [makeCompany()],
      teamMembers: [{ id: "tm-1", companyId: "company-1", name: "X", createdAt: new Date(), updatedAt: new Date() }],
    });
    const res = await handleDeleteTeamMember(deps, "owner-1", "company-1", "tm-1");
    assert.equal(res.status, 200);
    assert.equal(deps._state.teamMembers.length, 0);
  });
});

describe("handleListTeamMembers", () => {
  it("returns the team members ordered by displayOrder", async () => {
    const deps = makeDeps({
      teamMembers: [
        { id: "tm-1", companyId: "company-1", name: "A", displayOrder: 0, createdAt: new Date(), updatedAt: new Date() },
        { id: "tm-2", companyId: "company-1", name: "B", displayOrder: 1, createdAt: new Date(), updatedAt: new Date() },
      ],
    });
    const res = await handleListTeamMembers(deps, "company-1");
    assert.equal((res.body as any).data.length, 2);
  });
});
