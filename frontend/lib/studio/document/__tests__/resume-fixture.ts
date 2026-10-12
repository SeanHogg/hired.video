/**
 * A résumé content fixture shaped like production rows (not a clean
 * canonical example — see feedback_tests_with_real_fixtures):
 *
 *   - `basics` the way the upload pipeline stores it: empty-string defaults,
 *     `location: null` (the 2026-04-20 upload response in
 *     lib/__tests__/resume-service.passthrough.test.ts);
 *   - item ids in every shape the minting paths produce: `crypto.randomUUID()`
 *     (parse — api/src/services/resume/parseRefine.ts `mintSectionItemId`),
 *     its `it_<base36>_<rand>` fallback, the section editor's `item_<uuid>`
 *     (document-edit.ts `newId("item")`), and a seed-derived non-RFC uuid
 *     (`md5(slug)::uuid`, shared/__tests__/uuid-fixtures.ts);
 *   - `metaData` rows with legacy integer `metaType`s bound by `referenceId`
 *     (an image and an MP4 on a role, a link on a project);
 *   - `skillEvidence` rows bound to the same items, as the extractor writes
 *     them (`source: "extracted"`, no `monthsUsed`).
 *
 * Not a test file (no `.test.`), so the runner doesn't collect it.
 */
import type { ResumeContent } from "@shared/resume";
import { SEED_DERIVED_UUID } from "@shared/__tests__/uuid-fixtures";

export const OWNER_ID = "5715588f-148d-4606-b5ab-eadef7cbaf43";
export const WORK_STRIPE_ID = "6fd07e16-f141-4a82-9baa-f56dcc4aa566";
export const WORK_ACME_ID = "it_m9x2k1qz_4hf8a0c2";
export const PROJECT_ID = "item_3b1f0e5c-2d7a-4c1e-9f3b-8a6d2e4c1b90";
export const EDUCATION_ID = SEED_DERIVED_UUID;

export function resumeFixture(): ResumeContent {
  return {
    basics: {
      url: "",
      name: "Sean Hogg",
      email: "s@s.com",
      image: "",
      label: "CTO",
      phone: "1",
      summary: "25 years building hiring products.\nLed teams of 40.",
      location: null,
    },
    work: [
      {
        id: WORK_STRIPE_ID,
        name: "Stripe",
        position: "Senior Engineer",
        url: "",
        summary: "Payments infrastructure.",
        startDate: "2020-01-01",
        endDate: "2024-01-01",
        highlights: ["Cut p99 latency 40%", "Mentored 6 engineers"],
      },
      {
        id: WORK_ACME_ID,
        name: "Acme",
        position: "Junior Engineer",
        url: "",
        summary: "",
        startDate: "2018-01-01",
        endDate: "2019-12-31",
        highlights: [],
      },
    ],
    volunteer: [],
    education: [
      {
        id: EDUCATION_ID,
        institution: "University of Waterloo",
        url: "",
        area: "Computer Science",
        studyType: "BSc",
        startDate: "2014-09",
        endDate: "2018-04",
        score: "",
        courses: [],
      },
    ],
    awards: [],
    certificates: [],
    publications: [],
    skills: [
      { id: "sk1", name: "Python", level: "", keywords: [] },
      { id: "sk2", name: "TypeScript", level: "Expert", keywords: ["React", "Node"] },
    ],
    languages: [],
    interests: [],
    references: [],
    projects: [
      {
        id: PROJECT_ID,
        name: "hired.video",
        description: "Video résumés.",
        highlights: ["Shipped the studio"],
        keywords: [],
        startDate: "2023-01",
        endDate: "",
        url: "https://hired.video",
        roles: [],
        entity: "",
        type: "",
      },
    ],
    metaData: [
      { id: "m-img-1", userId: OWNER_ID, referenceId: WORK_STRIPE_ID, name: "Dashboard", metaType: 5, url: "https://cdn.hired.video/u/dash.png" },
      { id: "m-vid-1", userId: OWNER_ID, referenceId: WORK_STRIPE_ID, name: "Demo", metaType: 1, url: "https://cdn.hired.video/u/demo.mp4", createdAt: "2026-04-20T05:17:01.272Z" },
      { id: "m-link-1", userId: OWNER_ID, referenceId: PROJECT_ID, name: "", metaType: 0, url: "https://hired.video" },
    ],
    skillEvidence: [
      { id: "ev1", skillName: "Python", itemType: "work", referenceId: WORK_STRIPE_ID, source: "extracted" },
      { id: "ev2", skillId: "sk2", skillName: "TypeScript", itemType: "project", referenceId: PROJECT_ID, source: "manual", monthsUsed: 12 },
    ],
  } as ResumeContent;
}
