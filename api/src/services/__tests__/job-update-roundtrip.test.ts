import { describe, it } from "node:test";
import assert from "node:assert/strict";

// `resolveDeps` builds `defaultApiDeps()` (→ getDb → neon()) even when a
// fake `db` is injected, and neon() throws without a connection string.
// A dummy URL lets the client construct; it is never queried — every read
// goes through the injected fake db.
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";

import {
  buildJobColumnPatch,
  extractDetailsPatch,
  createJob,
  updateJob,
  getJobById,
} from "../job/JobService.js";
import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import type { CreateJobDTO } from "../../../../shared/job.js";

/**
 * Regression coverage for #878 — the job create/edit form ships ~15 fields
 * (requirements, responsibilities, employmentType, salary, status, expiry,
 * …) that were silently dropped: the route Zod schema stripped them and the
 * service hand-rolled a 5-column SET clause, so PUT returned 200 but
 * persisted nothing.
 *
 * The fix funnels both createJob + updateJob through one mapper
 * (`buildJobColumnPatch` + `extractDetailsPatch`). These tests pin the
 * mapping (the actual bug surface) and a create→read roundtrip.
 *
 * Run: node --import tsx --test src/services/__tests__/job-update-roundtrip.test.ts
 */

// ---------------------------------------------------------------------------
// 1. Pure mapper — every editable wire field reaches a column / detail bag
// ---------------------------------------------------------------------------
describe("buildJobColumnPatch — wire → job_items columns (#878)", () => {
  it("maps the full editable surface, normalizing employment type + salary + publish state", () => {
    const patch = buildJobColumnPatch({
      title: "Staff Engineer",
      description: "Build the platform.",
      company: "Acme",
      location: "Remote, US",
      employmentType: ["Contractor"], // PascalCase array → canonical kebab
      seniority: ["Senior"],
      workSetting: "Remote",
      salaryMin: 180000,
      salaryMax: 220000,
      currency: "EUR",
      status: "Open",
      expirationDate: "2030-01-15",
      applyUrl: "https://acme.com/apply",
    });

    assert.equal(patch.title, "Staff Engineer");
    assert.equal(patch.company, "Acme");
    assert.equal(patch.jobType, "contract"); // Contractor → contract
    assert.equal(patch.experienceLevel, "senior"); // #2090 canonical lowercase
    assert.equal(patch.isRemote, true); // workSetting Remote
    assert.equal(patch.salaryMin, "180000"); // numeric column stores string
    assert.equal(patch.salaryMax, "220000");
    assert.equal(patch.salaryCurrency, "EUR");
    assert.equal(patch.isActive, true); // status Open → published
    assert.equal(patch.applyUrl, "https://acme.com/apply");
    assert.ok(patch.expiresAt instanceof Date);
  });

  it("only emits keys that are present (partial-update safe)", () => {
    const patch = buildJobColumnPatch({ title: "Just the title" });
    assert.deepEqual(Object.keys(patch), ["title"]);
  });

  it("status non-Open unpublishes; legacy isPublic is the fallback", () => {
    assert.equal(buildJobColumnPatch({ status: "Closed" }).isActive, false);
    assert.equal(buildJobColumnPatch({ status: "Draft" }).isActive, false);
    assert.equal(buildJobColumnPatch({ isPublic: true }).isActive, true);
    assert.equal(buildJobColumnPatch({ isPublic: false }).isActive, false);
  });

  it("explicit isRemote wins over workSetting; Hybrid is not remote", () => {
    assert.equal(buildJobColumnPatch({ isRemote: true, workSetting: "Onsite" }).isRemote, true);
    assert.equal(buildJobColumnPatch({ workSetting: "Hybrid" }).isRemote, false);
  });

  it("work setting (#2069): canonicalizes + derives is_remote + keeps hybrid day-split", () => {
    const hybrid = buildJobColumnPatch({
      workSetting: "Hybrid",
      onsiteDaysPerWeek: 2,
      remoteDaysPerWeek: 3,
    });
    assert.equal(hybrid.workSetting, "hybrid");
    assert.equal(hybrid.isRemote, false);
    assert.equal(hybrid.onsiteDaysPerWeek, 2);
    assert.equal(hybrid.remoteDaysPerWeek, 3);

    const remote = buildJobColumnPatch({ workSetting: "Remote", onsiteDaysPerWeek: 2 });
    assert.equal(remote.workSetting, "remote");
    assert.equal(remote.isRemote, true);
    // Days are forced null for non-hybrid even if the caller sends them.
    assert.equal(remote.onsiteDaysPerWeek, null);

    const onsite = buildJobColumnPatch({ workSetting: "On-site" }); // alias spelling
    assert.equal(onsite.workSetting, "onsite");
    assert.equal(onsite.isRemote, false);
  });

  it("work setting: out-of-range hybrid days are clamped to [0,7]", () => {
    const p = buildJobColumnPatch({ workSetting: "Hybrid", onsiteDaysPerWeek: 99, remoteDaysPerWeek: -4 });
    assert.equal(p.onsiteDaysPerWeek, 7);
    assert.equal(p.remoteDaysPerWeek, 0);
  });

  it("accepts single-string employmentType + experienceLevel alias", () => {
    assert.equal(buildJobColumnPatch({ employmentType: "full_time" }).jobType, "full-time");
    assert.equal(buildJobColumnPatch({ experienceLevel: "mid" }).experienceLevel, "mid");
  });
});

// ---------------------------------------------------------------------------
// 2. Detail-bag extraction — jsonb keys
// ---------------------------------------------------------------------------
describe("extractDetailsPatch — details jsonb bag (#878)", () => {
  it("collects only the provided detail keys", () => {
    const d = extractDetailsPatch({
      requirements: ["5+ yrs", "TypeScript"],
      responsibilities: ["Ship features"],
    });
    assert.deepEqual(d, {
      requirements: ["5+ yrs", "TypeScript"],
      responsibilities: ["Ship features"],
    });
  });

  it("returns undefined when no detail keys are present", () => {
    assert.equal(extractDetailsPatch({ title: "x" }), undefined);
  });
});

// ---------------------------------------------------------------------------
// 3. create → read roundtrip through the fake DB
// ---------------------------------------------------------------------------
describe("createJob → getJobById roundtrip (#878)", () => {
  const dto: CreateJobDTO = {
    title: "Backend Engineer",
    description: "APIs and data.",
    company: "Globex",
    location: "NYC",
    employmentType: ["FullTime"],
    seniority: ["Mid"],
    workSetting: "Hybrid",
    salaryMin: 120000,
    salaryMax: 150000,
    currency: "USD",
    requirements: ["3+ yrs", "SQL"],
    responsibilities: ["Own the API"],
    status: "Open",
  };

  it("persists every editable field and reads it back", async () => {
    const { db } = buildFakeDb({ job_items: [] });
    const created = await createJob(dto, "user-1", { db } as any);

    const read = await getJobById(created.id, { db } as any);
    assert.ok(read);
    assert.equal(read!.title, "Backend Engineer");
    assert.equal(read!.company, "Globex");
    assert.equal(read!.employmentType, "full-time");
    assert.equal(read!.experienceLevel, "mid"); // #2090 canonical lowercase
    assert.equal(read!.salaryMin, 120000);
    assert.equal(read!.salaryMax, 150000);
    assert.equal(read!.isRemote, false); // Hybrid
    assert.deepEqual(read!.requirements, ["3+ yrs", "SQL"]);
    assert.deepEqual(read!.responsibilities, ["Own the API"]);
    assert.equal(read!.isActive, true);
    // #2069 — Hybrid is preserved as a distinct setting (was lost to is_remote before).
    assert.equal(read!.workSetting, "hybrid");
  });

  it("roundtrips the hybrid day-split (#2069)", async () => {
    const { db } = buildFakeDb({ job_items: [] });
    const created = await createJob(
      { ...dto, workSetting: "Hybrid", onsiteDaysPerWeek: 2, remoteDaysPerWeek: 3 },
      "user-1",
      { db } as any,
    );
    const read = await getJobById(created.id, { db } as any);
    assert.equal(read!.workSetting, "hybrid");
    assert.equal(read!.onsiteDaysPerWeek, 2);
    assert.equal(read!.remoteDaysPerWeek, 3);
    assert.equal(read!.isRemote, false);
  });

  it("updateJob persists scalar edits that the old 5-field SET clause dropped", async () => {
    const { db } = buildFakeDb({ job_items: [] });
    const created = await createJob(dto, "user-1", { db } as any);

    const updated = await updateJob(
      created.id,
      {
        employmentType: ["Contractor"],
        salaryMax: 200000,
        status: "Closed",
      },
      "user-1",
      { db } as any,
    );

    assert.ok(updated);
    assert.equal(updated!.employmentType, "contract");
    assert.equal(updated!.salaryMax, 200000);
    assert.equal(updated!.isActive, false);
    // Untouched field survives the partial update.
    assert.equal(updated!.title, "Backend Engineer");
  });
});
