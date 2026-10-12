/**
 * Tests for shared/resume-health.ts — the model-free content health check
 * used by the kit diagnostics report.
 *
 * Real-fixture style (per feedback_tests_with_real_fixtures): the fixture
 * mirrors a production résumé after a chat revision (2026-10-08) — one
 * bullet copied onto another job, ISO dates next to an "01/1999" education
 * entry, a part-time role carried by its summary alone.
 *
 * Run: node --import tsx --test shared/__tests__/resume-health.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dateFormatOf, resumeHealth } from "../resume-health.js";

const COPIED =
  "Directed a blended onshore/offshore team of 30 engineers and 5 vendor partners to ship 200+ features over 8 months, boosting product release cadence from quarterly to monthly and cutting lead-time by 60%.";

const fixture = {
  basics: { name: "Sean Hogg" },
  work: [
    {
      name: "BuilderForce.ai",
      position: "Chief Innovation Officer",
      summary: "The Innovation Platform for the Agentic Era.",
      startDate: "2026-01-01",
      endDate: "Present",
      highlights: [],
    },
    {
      name: "Hired.Video",
      position: "Consulting Fractional VP of Technology/CTO",
      startDate: "2022-10-01",
      endDate: "Present",
      highlights: ["Modernized applications with Kubernetes and CI/CD/CT pipelines.", COPIED],
    },
    {
      name: "OnTheClock",
      position: "Site Reliability / DevOps / CTO",
      startDate: "2024-04-01",
      endDate: "2024-11-01",
      highlights: [COPIED, "Automated manual builds, reducing cycle time and increasing deployment frequency."],
    },
  ],
  education: [{ institution: "University of Windsor", studyType: "BSc", startDate: "01/1999", endDate: "12/2004" }],
  awards: [{ title: "Innovation Award", awarder: "Urban Science", date: "2015-03-01" }],
};

describe("resumeHealth", () => {
  it("flags a bullet copied onto another job, with both paths", () => {
    const dup = resumeHealth(fixture).filter((i) => i.kind === "duplicateBullet");
    assert.equal(dup.length, 1);
    assert.deepEqual(dup[0].paths, ["work.1.highlights.1", "work.2.highlights.0"]);
  });

  it("flags the minority date format, naming its paths", () => {
    const mixed = resumeHealth(fixture).find((i) => i.kind === "mixedDateFormats");
    assert.ok(mixed);
    assert.deepEqual(mixed.paths, ["education.0.startDate", "education.0.endDate"]);
    assert.match(mixed.detail, /^YYYY-MM-DD \(most\) vs MM\/YYYY ×2$/);
  });

  it("does not call a role empty when its summary carries it", () => {
    assert.equal(resumeHealth(fixture).some((i) => i.kind === "emptyEntry"), false);
  });

  it("flags a role with neither summary nor bullets", () => {
    const bare = { work: [{ name: "Acme", position: "Engineer", highlights: [""] }] };
    assert.deepEqual(resumeHealth(bare).map((i) => i.kind), ["emptyEntry"]);
  });

  it("flags a reworded near-duplicate but not short generic bullets", () => {
    const content = {
      work: [
        {
          name: "A",
          highlights: [
            "Led multiple departments including Data, Engineering and IT Operations with 125+ staff.",
            "Led multiple departments including Data, Engineering, IT Operations with 125+ staff members.",
            "Wrote code.",
            "Wrote code daily.",
          ],
        },
      ],
    };
    const kinds = resumeHealth(content).map((i) => i.kind);
    assert.deepEqual(kinds, ["nearDuplicateBullet"]);
  });

  it("flags the same entry listed twice", () => {
    const entry = { name: "Urban Science", position: "Software Engineer", startDate: "2008-03-01", highlights: ["x"] };
    const issues = resumeHealth({ work: [entry, { ...entry, highlights: ["y"] }] });
    assert.deepEqual(issues.find((i) => i.kind === "duplicateEntry")?.paths, ["work.0", "work.1"]);
  });

  it("is clean on a consistent résumé and safe on junk input", () => {
    assert.deepEqual(resumeHealth({ work: [{ name: "A", position: "B", startDate: "2020-01", highlights: ["Shipped it."] }] }), []);
    assert.deepEqual(resumeHealth(null), []);
    assert.deepEqual(resumeHealth({ work: "nope", education: [null, 3] }), []);
  });
});

describe("dateFormatOf", () => {
  it("classifies the formats résumés actually contain", () => {
    assert.equal(dateFormatOf("2024-04-01"), "YYYY-MM-DD");
    assert.equal(dateFormatOf("2026-01"), "YYYY-MM");
    assert.equal(dateFormatOf("2015"), "YYYY");
    assert.equal(dateFormatOf("01/1999"), "MM/YYYY");
    assert.equal(dateFormatOf("3/14/2020"), "MM/DD/YYYY");
    assert.equal(dateFormatOf("Spring 2019"), "text");
    assert.equal(dateFormatOf("Present"), null);
    assert.equal(dateFormatOf(""), null);
  });
});
