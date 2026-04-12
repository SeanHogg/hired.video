import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ciGet,
  ciProp,
  buildMetaResume,
  extractJson,
  isParseComplete,
  parseResumeWithRegex,
} from "../resume-parse.js";

// ---------------------------------------------------------------------------
// Sample resume text used across multiple tests (matches the real user resume)
// ---------------------------------------------------------------------------
const SAMPLE_RESUME = `Sean Hogg
seanhogg@gmail.com ▪ 2488250176 ▪ Troy, MI
Profile
CTO and Technology Leader with 25 years of experience driving business value through innovative technology
solutions with amazing teams. Expert in aligning technical goals with business objectives, optimizing scalable
cloud-native solutions, and fostering a collaborative team environment.
Work Experience
HireFractionalTalent.com | On-Demand/Interim/Fractional CxO ▪ Troy, Michigan
Consulting Fractional VP of Technology/CTO
10/2022 - Present
⦁ Mentor startups and SMBs in FinTech, Health, Retail, Agriculture, and Energy sectors.
⦁ Specialize in SaaS, IoT, SaMD, and e-commerce platforms.
⦁ Implement CRM and sales automation using HubSpot and Salesforce.
Alliance Inspection Management ▪ Farmington Hills, Michigan
VP of Technology/CIO
08/2021 – 01/2024
⦁ Reduced operating costs by $1.79M through IT process modernization and contract renegotiation.
⦁ Lowered attrition by 90% by fostering a performance-based, people-first culture.
Career Now Brands ▪ Royal Oak, Michigan
EVP/VP, Product & Technology
03/2019 – 09/2021
⦁ Increased project completion rate by 175% while cutting costs from $4M to $1.7M in the first year.
⦁ Delivered 3 new products generating $6M+ in revenue within 2 years using a single framework.
United Wholesale Mortgage - Pontiac, Michigan
Solutions Architecture, Team Lead
12/2017 – 03/2019
⦁ Led a 10+ member cross-functional Solution Architecture Team.
Urban Science ▪ Detroit, Michigan
Principal Full Stack Software Engineer (Application Architect)
10/2014 – 12/2017
⦁ Led development of Contact Manager SaaS, managing 10+ engineers.
Dassault Systèmes 3DEXCITE ▪ Royal Oak, Michigan
Software Development Manager
10/2013 – 10/2014
⦁ Led three SaaS product teams with $3.5M budget.
Urban Science ▪ Detroit, Michigan
Software Development Manager / Sr. Full Stack Software Engineer
03/2008 – 10/2013
⦁ Managed and developed multiple SaaS products.
Compuware ▪ Detroit, Michigan
Full Stack Software Engineer
04/2006 – 01/2008
⦁ Modernized VB6 applications to C# .Net.
RelatedNews.ca ▪ Windsor, Canada
Founder
01/1999 – 01/2005
⦁ Founded and sold RelatedNews.ca, a startup for custom websites with unique CMS solutions.
Education
University of Windsor, Computer Science
01/1999 – 12/2004
University of Windsor, Psychology
01/1999 – 12/2004
Volunteering
SCORE Mentors, Certified Business Mentor (12/2022 - Present)
Mentors in Tech (MinT), Mentor (01/2023 - Present)
Micromentor, Mentor (12/2022 - Present)`;

// ═══════════════════════════════════════════════════════════════════════════
// ciGet / ciProp — case-insensitive property lookup
// ═══════════════════════════════════════════════════════════════════════════
describe("ciGet / ciProp", () => {
  it("returns lowercase key when present", () => {
    assert.equal(ciGet({ basics: "lo" }, "basics"), "lo");
  });

  it("falls back to PascalCase key", () => {
    assert.equal(ciGet({ Basics: "hi" }, "basics"), "hi");
  });

  it("returns undefined when neither case exists", () => {
    assert.equal(ciGet({}, "basics"), undefined);
  });

  it("prefers lowercase over PascalCase when both exist", () => {
    assert.equal(ciGet({ basics: "lo", Basics: "hi" }, "basics"), "lo");
  });

  it("ciProp works the same way", () => {
    assert.equal(ciProp({ Name: "Sean" }, "name"), "Sean");
    assert.equal(ciProp({ name: "Sean" }, "name"), "Sean");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildMetaResume — normalises PascalCase / lowercase content into metaResume
// ═══════════════════════════════════════════════════════════════════════════
describe("buildMetaResume", () => {
  const RID = "aaaa-bbbb";

  it("reads lowercase (AI-parsed) content correctly", () => {
    const content = {
      basics: {
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "555-0100",
        summary: "Engineer",
        location: { city: "NYC", region: "NY" },
      },
      work: [{ name: "Acme", position: "Dev", startDate: "2020", endDate: "2023" }],
      education: [{ institution: "MIT", area: "CS" }],
    };
    const meta = buildMetaResume(content, RID, "Untitled");
    assert.equal(meta.basics.name, "Jane Doe");
    assert.equal(meta.basics.email, "jane@example.com");
    assert.equal(meta.basics.summary, "Engineer");
    assert.equal(meta.basics.location?.city, "NYC");
    assert.equal(meta.work.length, 1);
    assert.equal((meta.work[0] as any).name, "Acme");
    assert.equal(meta.education.length, 1);
    assert.equal((meta.education[0] as any).institution, "MIT");
  });

  it("reads PascalCase (frontend ResumeData) content correctly", () => {
    const content = {
      Basics: {
        Name: "Sean Hogg",
        Email: "sean@example.com",
        Phone: "248-555-0000",
        Summary: "CTO",
        Location: { City: "Troy", Region: "MI" },
      },
      Work: [
        { Name: "Company A", Position: "CTO", StartDate: "2022", EndDate: "Present" },
        { Name: "Company B", Position: "VP", StartDate: "2019", EndDate: "2022" },
      ],
      Education: [{ Institution: "UW", Area: "Computer Science" }],
      Volunteer: [{ Organization: "SCORE", Position: "Mentor" }],
    };
    const meta = buildMetaResume(content, RID, "Untitled");
    assert.equal(meta.basics.name, "Sean Hogg");
    assert.equal(meta.basics.email, "sean@example.com");
    assert.equal(meta.basics.location?.city, "Troy");
    assert.equal(meta.basics.location?.region, "MI");
    assert.equal(meta.work.length, 2);
    assert.equal((meta.work[0] as any).Name, "Company A");
    assert.equal(meta.education.length, 1);
    assert.equal(meta.volunteer.length, 1);
  });

  it("falls back to rowTitle when basics.name is missing", () => {
    const meta = buildMetaResume({}, RID, "Fallback Title");
    assert.equal(meta.basics.name, "Fallback Title");
  });

  it("assigns default ids when items lack them", () => {
    const content = {
      work: [{ name: "NoId Corp", position: "Dev" }],
    };
    const meta = buildMetaResume(content, RID, "T");
    assert.equal((meta.work[0] as any).id, `${RID}-work-0`);
  });

  it("preserves existing ids", () => {
    const content = {
      work: [{ id: "custom-id", name: "HasId Corp" }],
    };
    const meta = buildMetaResume(content, RID, "T");
    assert.equal((meta.work[0] as any).id, "custom-id");
  });

  it("handles null/missing location gracefully", () => {
    const content = { basics: { name: "Test" } };
    const meta = buildMetaResume(content, RID, "T");
    assert.equal(meta.basics.location, null);
  });

  it("returns empty arrays for missing sections", () => {
    const meta = buildMetaResume({}, RID, "T");
    assert.equal(meta.work.length, 0);
    assert.equal(meta.education.length, 0);
    assert.equal(meta.skills.length, 0);
    assert.equal(meta.volunteer.length, 0);
    assert.equal(meta.certificates.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// extractJson — strips markdown fences and finds JSON in LLM output
// ═══════════════════════════════════════════════════════════════════════════
describe("extractJson", () => {
  it("parses plain JSON", () => {
    const result = extractJson('{"name": "test"}');
    assert.equal(result.name, "test");
  });

  it("strips ```json fences", () => {
    const result = extractJson('```json\n{"name": "test"}\n```');
    assert.equal(result.name, "test");
  });

  it("strips ``` fences without language tag", () => {
    const result = extractJson('```\n{"name": "test"}\n```');
    assert.equal(result.name, "test");
  });

  it("extracts JSON from surrounding text", () => {
    const result = extractJson('Here is the result: {"name": "test"} and some more text');
    assert.equal(result.name, "test");
  });

  it("throws on invalid input", () => {
    assert.throws(() => extractJson("not json at all"), /No valid JSON/);
  });

  it("handles nested objects", () => {
    const result = extractJson('{"basics": {"name": "Sean", "location": {"city": "Troy"}}}');
    const basics = result.basics as any;
    assert.equal(basics.name, "Sean");
    assert.equal(basics.location.city, "Troy");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isParseComplete — validates AI parse results have real content
// ═══════════════════════════════════════════════════════════════════════════
describe("isParseComplete", () => {
  it("returns true when name + work with content exist", () => {
    const parsed = {
      basics: { name: "Sean Hogg" },
      work: [{ name: "Acme", position: "CTO" }],
      education: [],
      skills: [],
    };
    assert.equal(isParseComplete(parsed), true);
  });

  it("returns true when name + education with content exist", () => {
    const parsed = {
      basics: { name: "Sean Hogg" },
      work: [],
      education: [{ institution: "MIT", area: "CS" }],
      skills: [],
    };
    assert.equal(isParseComplete(parsed), true);
  });

  it("returns true when name + skills with content exist", () => {
    const parsed = {
      basics: { name: "Sean Hogg" },
      work: [],
      education: [],
      skills: [{ name: "JavaScript" }],
    };
    assert.equal(isParseComplete(parsed), true);
  });

  it("returns false when no name", () => {
    const parsed = {
      basics: { name: "" },
      work: [{ name: "Acme", position: "CTO" }],
    };
    assert.equal(isParseComplete(parsed), false);
  });

  it("returns false when name exists but all sections empty", () => {
    const parsed = {
      basics: { name: "Sean Hogg" },
      work: [],
      education: [],
      skills: [],
    };
    assert.equal(isParseComplete(parsed), false);
  });

  it("CRITICAL: returns false for placeholder objects with empty strings", () => {
    // This was the original bug — AI returned arrays with empty placeholder objects
    const parsed = {
      basics: { name: "Sean Hogg" },
      work: [],
      education: [{ institution: "", area: "", studyType: "" }],
      skills: [],
    };
    assert.equal(isParseComplete(parsed), false);
  });

  it("CRITICAL: returns false for whitespace-only content", () => {
    const parsed = {
      basics: { name: "Sean Hogg" },
      work: [{ name: "  ", position: "  " }],
      education: [],
      skills: [],
    };
    assert.equal(isParseComplete(parsed), false);
  });

  it("handles PascalCase keys (Name, Position, Institution)", () => {
    const parsed = {
      basics: { Name: "Sean Hogg" },
      work: [{ Name: "Acme", Position: "CTO" }],
    };
    assert.equal(isParseComplete(parsed), true);
  });

  it("returns false when basics is missing entirely", () => {
    const parsed = {
      work: [{ name: "Acme" }],
    };
    assert.equal(isParseComplete(parsed), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parseResumeWithRegex — full regex-based resume extraction
// ═══════════════════════════════════════════════════════════════════════════
describe("parseResumeWithRegex", () => {
  // -- Basics extraction --
  describe("basics", () => {
    it("extracts name from first line", () => {
      const result = parseResumeWithRegex(SAMPLE_RESUME);
      const basics = result.basics as any;
      assert.equal(basics.name, "Sean Hogg");
    });

    it("extracts email", () => {
      const basics = (parseResumeWithRegex(SAMPLE_RESUME)).basics as any;
      assert.equal(basics.email, "seanhogg@gmail.com");
    });

    it("extracts phone number", () => {
      const basics = (parseResumeWithRegex(SAMPLE_RESUME)).basics as any;
      assert.equal(basics.phone, "2488250176");
    });

    it("extracts profile/summary section", () => {
      const basics = (parseResumeWithRegex(SAMPLE_RESUME)).basics as any;
      assert.ok(basics.summary.length > 50, "Summary should be substantial");
      assert.ok(basics.summary.includes("CTO and Technology Leader"));
    });

    it("extracts location (city, region)", () => {
      const basics = (parseResumeWithRegex(SAMPLE_RESUME)).basics as any;
      assert.ok(basics.location, "Location should be extracted");
      assert.equal(basics.location.city, "Troy");
      assert.equal(basics.location.region, "MI");
    });
  });

  // -- Work experience --
  describe("work", () => {
    it("extracts multiple work entries", () => {
      const result = parseResumeWithRegex(SAMPLE_RESUME);
      const work = result.work as any[];
      assert.ok(work.length >= 5, `Expected at least 5 work entries, got ${work.length}`);
    });

    it("extracts first work entry with company and position", () => {
      const work = (parseResumeWithRegex(SAMPLE_RESUME)).work as any[];
      const first = work[0];
      assert.ok(first, "First work entry should exist");
      assert.ok(
        first.name.includes("HireFractionalTalent") || first.position.includes("Fractional"),
        `Expected HireFractionalTalent or Fractional in first entry, got: name="${first.name}" position="${first.position}"`,
      );
    });

    it("extracts start and end dates", () => {
      const work = (parseResumeWithRegex(SAMPLE_RESUME)).work as any[];
      const first = work[0];
      assert.equal(first.startDate, "10/2022");
      assert.equal(first.endDate, "Present");
    });

    it("extracts bullet point highlights", () => {
      const work = (parseResumeWithRegex(SAMPLE_RESUME)).work as any[];
      const first = work[0];
      assert.ok(
        Array.isArray(first.highlights) && first.highlights.length > 0,
        "First work entry should have highlights",
      );
      assert.ok(first.highlights[0].includes("Mentor startups"));
    });

    it("stops work section at Education boundary", () => {
      const work = (parseResumeWithRegex(SAMPLE_RESUME)).work as any[];
      // Education entries should NOT appear in work
      const hasEducationInWork = work.some(
        (w: any) =>
          w.name?.includes("University") || w.position?.includes("Computer Science"),
      );
      assert.equal(hasEducationInWork, false, "Education items should not leak into work");
    });

    it("handles em-dash date separators", () => {
      const text = `Work Experience
Acme Corp ▪ NYC
Senior Developer
08/2021 – 01/2024
⦁ Built things`;
      const work = (parseResumeWithRegex(text)).work as any[];
      assert.equal(work.length, 1);
      assert.equal(work[0].startDate, "08/2021");
      assert.equal(work[0].endDate, "01/2024");
    });
  });

  // -- Education --
  describe("education", () => {
    it("extracts education entries", () => {
      const result = parseResumeWithRegex(SAMPLE_RESUME);
      const education = result.education as any[];
      assert.ok(education.length >= 2, `Expected at least 2 education entries, got ${education.length}`);
    });

    it("extracts institution and area", () => {
      const education = (parseResumeWithRegex(SAMPLE_RESUME)).education as any[];
      const cs = education.find((e: any) => e.area?.includes("Computer Science"));
      assert.ok(cs, "Should find Computer Science education entry");
      assert.equal(cs.institution, "University of Windsor");
    });

    it("extracts education dates", () => {
      const education = (parseResumeWithRegex(SAMPLE_RESUME)).education as any[];
      const first = education[0];
      assert.equal(first.startDate, "01/1999");
      assert.equal(first.endDate, "12/2004");
    });
  });

  // -- Volunteering --
  describe("volunteer", () => {
    it("extracts volunteer entries", () => {
      const result = parseResumeWithRegex(SAMPLE_RESUME);
      const volunteer = result.volunteer as any[];
      assert.ok(volunteer.length >= 2, `Expected at least 2 volunteer entries, got ${volunteer.length}`);
    });

    it("extracts organization and position", () => {
      const volunteer = (parseResumeWithRegex(SAMPLE_RESUME)).volunteer as any[];
      const score = volunteer.find((v: any) => v.organization?.includes("SCORE"));
      assert.ok(score, "Should find SCORE volunteer entry");
      assert.ok(score.position.includes("Certified Business Mentor"));
    });

    it("extracts volunteer dates from parenthetical format", () => {
      const volunteer = (parseResumeWithRegex(SAMPLE_RESUME)).volunteer as any[];
      const score = volunteer.find((v: any) => v.organization?.includes("SCORE"));
      assert.ok(score, "Should find SCORE entry");
      assert.equal(score.startDate, "12/2022");
      assert.equal(score.endDate, "Present");
    });
  });

  // -- Edge cases --
  describe("edge cases", () => {
    it("handles empty text", () => {
      const result = parseResumeWithRegex("");
      assert.equal((result.basics as any).name, "");
      assert.deepEqual(result.work, []);
      assert.deepEqual(result.education, []);
    });

    it("handles text with no structured sections", () => {
      const result = parseResumeWithRegex("Just a name\nsome random text");
      assert.equal((result.basics as any).name, "Just a name");
      assert.deepEqual(result.work, []);
    });

    it("returns all expected section keys", () => {
      const result = parseResumeWithRegex(SAMPLE_RESUME);
      const expectedKeys = [
        "basics", "work", "education", "skills", "volunteer",
        "awards", "certificates", "publications", "languages",
        "interests", "references", "projects",
      ];
      for (const key of expectedKeys) {
        assert.ok(key in result, `Missing key: ${key}`);
      }
    });

    it("handles resume with skills section", () => {
      const text = `John Doe
john@example.com
Skills
JavaScript
Python
React
Education
MIT, Computer Science`;
      const result = parseResumeWithRegex(text);
      const skills = result.skills as any[];
      assert.ok(skills.length >= 3, `Expected at least 3 skills, got ${skills.length}`);
    });

    it("handles year-only date formats", () => {
      const text = `Work Experience
Acme Corp
Senior Dev
2020 - 2023
⦁ Did stuff`;
      const work = (parseResumeWithRegex(text)).work as any[];
      assert.equal(work.length, 1);
      assert.equal(work[0].startDate, "2020");
      assert.equal(work[0].endDate, "2023");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration: simulates the full flow that the user reported as broken
// ═══════════════════════════════════════════════════════════════════════════
describe("Integration: full resume create/save round-trip", () => {
  it("PascalCase content (frontend save) produces correct metaResume", () => {
    // Simulates what happens when the frontend saves resume data
    const content = {
      Basics: {
        Id: "abc-basics-0",
        Name: "Sean Hogg",
        Email: "seanhogg@gmail.com",
        Phone: "2488250176",
        Summary: "CTO and Technology Leader with 25 years of experience",
        Location: { City: "Troy", Region: "MI" },
      },
      Work: [
        {
          Id: "abc-work-0",
          Name: "Consulting Fractional VP of Technology/CTO",
          Position: "Consulting Fractional VP of Technology/CTO",
          StartDate: "10/2022",
          EndDate: "Present",
          Highlights: ["Mentor startups and SMBs", "Specialize in SaaS"],
        },
        {
          Id: "abc-work-1",
          Name: "VP of Technology/CIO",
          Position: "VP of Technology/CIO",
          StartDate: "08/2021",
          EndDate: "01/2024",
          Highlights: ["Reduced operating costs by $1.79M"],
        },
      ],
      Education: [
        { Id: "abc-edu-0", Institution: "University of Windsor", Area: "Computer Science" },
        { Id: "abc-edu-1", Institution: "University of Windsor", Area: "Psychology" },
      ],
      Volunteer: [
        { Id: "abc-vol-0", Organization: "SCORE Mentors", Position: "Certified Business Mentor" },
      ],
    };

    const meta = buildMetaResume(content, "abc", "Sean Hogg");

    // Basics
    assert.equal(meta.basics.name, "Sean Hogg");
    assert.equal(meta.basics.email, "seanhogg@gmail.com");
    assert.equal(meta.basics.phone, "2488250176");
    assert.ok(meta.basics.summary?.toString().includes("CTO"));
    assert.equal(meta.basics.location?.city, "Troy");
    assert.equal(meta.basics.location?.region, "MI");

    // Work — must NOT be empty (this was the original bug)
    assert.equal(meta.work.length, 2, "Work should have 2 entries");
    assert.equal((meta.work[0] as any).Name, "Consulting Fractional VP of Technology/CTO");
    assert.ok(Array.isArray((meta.work[0] as any).Highlights));

    // Education — must NOT be empty
    assert.equal(meta.education.length, 2, "Education should have 2 entries");
    assert.equal((meta.education[0] as any).Institution, "University of Windsor");

    // Volunteer
    assert.equal(meta.volunteer.length, 1);
  });

  it("lowercase content (AI-parsed) produces correct metaResume", () => {
    // Simulates what happens when AI parses a resume on create
    const content = {
      basics: {
        name: "Sean Hogg",
        email: "seanhogg@gmail.com",
        phone: "2488250176",
        summary: "CTO and Technology Leader",
        location: { city: "Troy", region: "MI" },
      },
      work: [
        { name: "HireFractionalTalent.com", position: "CTO", startDate: "10/2022", endDate: "Present" },
      ],
      education: [
        { institution: "University of Windsor", area: "Computer Science" },
      ],
    };

    const meta = buildMetaResume(content, "xyz", "Sean Hogg");

    assert.equal(meta.basics.name, "Sean Hogg");
    assert.equal(meta.work.length, 1);
    assert.equal(meta.education.length, 1);
  });

  it("regex parser extracts the real user resume correctly", () => {
    // This is the exact flow: rawText -> parseResumeWithRegex -> content stored in DB
    const result = parseResumeWithRegex(SAMPLE_RESUME);
    const basics = result.basics as any;
    const work = result.work as any[];
    const education = result.education as any[];
    const volunteer = result.volunteer as any[];

    // Basics must be populated
    assert.equal(basics.name, "Sean Hogg");
    assert.equal(basics.email, "seanhogg@gmail.com");
    assert.ok(basics.summary.length > 20, "Summary should be extracted");
    assert.ok(basics.location, "Location should be extracted");

    // Work must have all entries (was returning [] in the bug)
    assert.ok(work.length >= 5, `Expected at least 5 work entries, got ${work.length}`);

    // Education must have both entries
    assert.equal(education.length, 2, `Expected 2 education entries, got ${education.length}`);

    // Volunteer must have entries
    assert.ok(volunteer.length >= 2, `Expected at least 2 volunteer entries, got ${volunteer.length}`);

    // Then buildMetaResume must propagate all of this
    const meta = buildMetaResume(result, "test-id", "Sean Hogg");
    assert.ok(meta.work.length >= 5, "metaResume.work should have all entries");
    assert.equal(meta.education.length, 2, "metaResume.education should have 2 entries");
    assert.ok(meta.volunteer.length >= 2, "metaResume.volunteer should have entries");
  });
});
