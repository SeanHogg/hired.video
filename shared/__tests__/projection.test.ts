import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  USER_LIST_FIELDS,
  JOB_LIST_FIELDS,
  CARD_FIELDS_BY_KIND,
  parseFields,
  projectRows,
  serializeListFields,
} from "../projection.js";

/**
 * Regression guard for the People-grid "User / Active Unknown / Joined
 * Unknown" bug. Root cause: USER_LIST_FIELDS named raw DB columns
 * (name / avatarUrl / city / country) while /api/users/public projects
 * over the `toPublicUserCardDto` DTO (fullName / avatar / location /
 * createdAt). `projectRows` keeps only keys present in BOTH the row and
 * the requested list, so name / avatar / timestamps were silently dropped.
 *
 * The fixture below mirrors the EXACT shape `toPublicUserCardDto` emits
 * (per the tests-with-real-fixtures rule) so a future rename on either
 * side trips this test instead of blanking the live cards.
 */

// Representative public-user card DTO — keys + value types match
// api/src/services/user/userDtos.ts `toPublicUserCardDto`.
const cardDto = {
  id: "5ab37629-7d20-42fb-8a3d-1dc82ad7b592",
  type: "people" as const,
  firstName: "Ada",
  lastName: "Lovelace",
  fullName: "Ada Lovelace",
  role: "job_seeker",
  headline: "Analytical engine pioneer",
  summary: "First programmer.",
  location: "London, UK",
  avatar: "https://cdn.example.com/ada.png",
  currentRole: "Mathematician",
  currentCompany: "Analytical Engine Co.",
  openToWork: true,
  skills: ["algorithms", "mathematics"],
  yearsOfExperience: 12,
  emailConfirmed: true,
  slug: "ada-lovelace",
  isCreator: false,
  creatorPrograms: { video: false, voice: false, services: false, articles: false, courses: false, templates: false },
  createdAt: "2026-01-02T03:04:05.000Z",
  updatedAt: "2026-05-20T10:11:12.000Z",
};

describe("user list-field projection", () => {
  it("every field the People card requests is in the allow-list", () => {
    // If a card field isn't allow-listed, serializeListFields silently
    // drops it before it ever reaches the wire.
    const allow = new Set<string>(USER_LIST_FIELDS);
    for (const f of CARD_FIELDS_BY_KIND.users) {
      assert.ok(allow.has(f), `card field "${f}" missing from USER_LIST_FIELDS`);
    }
  });

  it("allow-list names DTO keys, not raw DB columns", () => {
    // The exact regression: these DB-column spellings must NOT appear, or
    // projection drops the corresponding DTO key.
    const allow = new Set<string>(USER_LIST_FIELDS);
    for (const dbColumn of ["name", "avatarUrl", "city", "country"]) {
      assert.ok(!allow.has(dbColumn), `USER_LIST_FIELDS leaks DB column "${dbColumn}"`);
    }
    // ...and every allow-listed key must exist on the real DTO shape.
    const dtoKeys = new Set(Object.keys(cardDto));
    for (const f of USER_LIST_FIELDS) {
      assert.ok(dtoKeys.has(f), `USER_LIST_FIELDS key "${f}" is not a toPublicUserCardDto key`);
    }
  });

  it("card-critical fields survive the projection round-trip", () => {
    const requested = serializeListFields("users", CARD_FIELDS_BY_KIND.users);
    assert.ok(requested, "serializeListFields returned null for the card subset");
    const fields = parseFields(requested, USER_LIST_FIELDS);
    const [projected] = projectRows([cardDto], fields) as Array<Partial<typeof cardDto>>;

    // The fields whose loss produced "User / Active Unknown / Joined Unknown".
    assert.equal(projected.fullName, "Ada Lovelace");
    assert.equal(projected.firstName, "Ada");
    assert.equal(projected.lastName, "Lovelace");
    assert.equal(projected.avatar, "https://cdn.example.com/ada.png");
    assert.equal(projected.createdAt, "2026-01-02T03:04:05.000Z");
    assert.equal(projected.updatedAt, "2026-05-20T10:11:12.000Z");
    // Already-working fields stay working.
    assert.equal(projected.role, "job_seeker");
    assert.equal(projected.slug, "ada-lovelace");
    assert.equal(projected.location, "London, UK");
    assert.equal(projected.currentCompany, "Analytical Engine Co.");
  });

  it("trims the payload — non-card fields are dropped from the card view", () => {
    const fields = parseFields(serializeListFields("users", CARD_FIELDS_BY_KIND.users), USER_LIST_FIELDS);
    const [projected] = projectRows([cardDto], fields) as Array<Partial<typeof cardDto>>;
    // The whole point of #1370: skills JSON + creator flags don't ship on
    // the directory card.
    assert.equal("skills" in projected, false);
    assert.equal("summary" in projected, false);
    assert.equal("creatorPrograms" in projected, false);
    assert.equal("yearsOfExperience" in projected, false);
  });
});

/**
 * Same footgun, jobs flavour: the job cards rendered the literal string
 * "undefined" for every employer because JOB_LIST_FIELDS / CARD_FIELDS_BY_KIND
 * named `companyName` (a DB-ish spelling) while the `rowToJob` DTO every list
 * endpoint ships emits `company`. projectRows kept only keys present in BOTH
 * the row and the requested list, so the employer name was silently dropped
 * and the frontend `${job.company}` template literal printed "undefined".
 */

// Representative jobs list DTO — keys + value types match
// api/src/services/job/JobService.ts `rowToJob`.
const jobDto = {
  id: "f1a0fcf4-52ad-4806-8e65-7f0e166f75e6",
  title: "Reliability Manager",
  slug: "f1a0fcf4-52ad-4806-8e65-7f0e166f75e6",
  company: "Detroit Salt Company",
  location: "Detroit, MI, US",
  description: "Long job body that should NOT ship on the card view.",
  employmentType: "full_time",
  experienceLevel: "entry",
  isRemote: false,
  salaryMin: 80000,
  salaryMax: 120000,
  postedDate: "2026-06-21T00:00:00.000Z",
};

describe("job list-field projection", () => {
  it("allow-list names the DTO key `company`, not the DB-ish `companyName`", () => {
    const allow = new Set<string>(JOB_LIST_FIELDS);
    assert.ok(allow.has("company"), "JOB_LIST_FIELDS must allow-list the DTO key `company`");
    assert.ok(!allow.has("companyName"), "JOB_LIST_FIELDS leaks the non-DTO key `companyName`");
    assert.ok(
      !CARD_FIELDS_BY_KIND.jobs.includes("companyName"),
      "CARD_FIELDS_BY_KIND.jobs leaks the non-DTO key `companyName`",
    );
  });

  it("the employer name survives the projection round-trip", () => {
    const fields = parseFields(serializeListFields("jobs", CARD_FIELDS_BY_KIND.jobs), JOB_LIST_FIELDS);
    const [projected] = projectRows([jobDto], fields) as Array<Partial<typeof jobDto>>;
    // The field whose loss made the card render "undefined".
    assert.equal(projected.company, "Detroit Salt Company");
    assert.equal(projected.title, "Reliability Manager");
    assert.equal(projected.location, "Detroit, MI, US");
    // ...and the heavy job body is still trimmed off the card view.
    assert.equal("description" in projected, false);
  });
});
