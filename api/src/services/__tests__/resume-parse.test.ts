import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ciGet,
  ciProp,
  buildMetaResume,
  extractJson,
  isParseComplete,
  parseResumeWithRegex,
} from "../resume-parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string): string =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

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

    it("extracts skills from Technologies: bullet when no Skills header", () => {
      const text = `Sean Hogg
Work Experience
Acme Corp ▪ Troy, Michigan
CTO
10/2022 - Present
⦁ Technologies: BlockChain, .net, Python, Claude/ChatGTP, chatbotAI
Education
University of Windsor, Computer Science
01/1999 – 12/2004`;
      const result = parseResumeWithRegex(text);
      const skills = result.skills as any[];
      assert.ok(skills.length >= 3, `Expected at least 3 skills from Technologies line, got ${skills.length}`);
      assert.ok(skills.some((s: any) => s.name.includes("Python")), "Should extract Python");
    });

    it("extracts skills from Tech Stack: line", () => {
      const text = `Name
Work Experience
Co
Dev
2020 - 2023
⦁ Tech Stack: React, Node.js, PostgreSQL, Docker`;
      const skills = (parseResumeWithRegex(text)).skills as any[];
      assert.ok(skills.length >= 3, `Expected at least 3 skills, got ${skills.length}`);
    });

    it("prefers Skills section over Technologies fallback", () => {
      const text = `Name
Skills
JavaScript
Python
Work Experience
Co
Dev
2020 - 2023
⦁ Technologies: Obscure-Framework, Another-Framework`;
      const skills = (parseResumeWithRegex(text)).skills as any[];
      // Should get Skills section entries, not Technologies bullet
      assert.ok(skills.some((s: any) => s.name === "JavaScript"));
      assert.ok(!skills.some((s: any) => s.name.includes("Obscure")));
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

// ═══════════════════════════════════════════════════════════════════════════
// Sean Hogg 2022-11 PDF — full-document regression test
//
// Ensures the regex parser hits the advertised counts for the real LinkedIn-
// exported PDF resume shape (Position / Company / Date 3-line layout, "MMM
// YYYY" date ranges, "Honors & Awards" / "Licenses & Certifications" section
// headers, bullet-delimited skill lists). Prior to the parser fix this file
// would return only 1/9 work entries.
//
// Fixture is the text extracted from `Resume-Sean-Hogg-Full-2022-11 (1).pdf`
// via pdfjs-dist (the same extractor the web UI uses), so this test covers
// the end-to-end path a user sees: upload PDF → extract text → regex parse.
// ═══════════════════════════════════════════════════════════════════════════
describe("parseResumeWithRegex — Sean Hogg 2022-11 PDF", () => {
  const SEAN_HOGG_2022 = readFixture("sean-hogg-2022-11.txt");
  const parsed = parseResumeWithRegex(SEAN_HOGG_2022);
  const work = parsed.work as any[];
  const education = parsed.education as any[];
  const skills = parsed.skills as any[];
  const certificates = parsed.certificates as any[];
  const awards = parsed.awards as any[];
  const basics = parsed.basics as any;

  it("extracts basics (name, email)", () => {
    assert.equal(basics.name, "Sean Hogg");
    assert.equal(basics.email, "seanhogg@gmail.com");
  });

  it("extracts 9 work entries (one per employer)", () => {
    assert.equal(work.length, 9, `Expected 9 work entries, got ${work.length}`);
  });

  it("extracts the correct companies for each work entry", () => {
    const companies = work.map((w) => w.name);
    assert.deepEqual(companies, [
      "Alliance Inspection Management",
      "Career Now Brands",
      "United Wholesale Mortgage",
      "Urban Science",
      "3DEXCITE",
      "Urban Science",
      "Urban Science",
      "Compuware",
      "RelatedNews.ca",
    ]);
  });

  it("extracts positions for each work entry", () => {
    const positions = work.map((w) => w.position);
    assert.ok(positions.includes("CIO/VP of Technology"), "missing CIO/VP of Technology");
    assert.ok(positions.includes("VP/EVP, Product & Technology"), "missing VP/EVP");
    assert.ok(positions.includes("Solutions Architecture, Team Lead"), "missing Solutions Arch Lead");
    assert.ok(positions.includes("Founder"), "missing Founder");
  });

  it("extracts 'MMM YYYY - Present' and 'MMM YYYY - MMM YYYY' date ranges", () => {
    const first = work[0];
    assert.equal(first.startDate, "Sep 2021");
    assert.equal(first.endDate.toLowerCase(), "present");

    const second = work[1];
    assert.equal(second.startDate, "Mar 2019");
    assert.equal(second.endDate, "Sep 2021");
  });

  it("extracts 2 education entries (Computer Science + Psychology)", () => {
    assert.equal(education.length, 2, `Expected 2 education entries, got ${education.length}`);
    assert.equal(education[0].institution, "University of Windsor");
    assert.equal(education[1].institution, "University of Windsor");
    // The degree line ("Bachelor of Science (BSc), Computer Science")
    // should populate studyType or area so we can tell the two apart.
    const areas = education.map((e) => (e.area || e.studyType || "").toLowerCase());
    assert.ok(
      areas.some((a) => a.includes("computer science")),
      `Expected a CS entry, got ${JSON.stringify(areas)}`,
    );
    assert.ok(
      areas.some((a) => a.includes("psychology")),
      `Expected a Psychology entry, got ${JSON.stringify(areas)}`,
    );
  });

  it("extracts at least 12 certifications from the Licenses & Certifications section", () => {
    assert.ok(
      certificates.length >= 12,
      `Expected at least 12 certifications, got ${certificates.length}`,
    );
    const names = certificates.map((c) => c.name);
    assert.ok(
      names.some((n: string) => /AWS Administration/i.test(n)),
      "Expected 'AWS Administration Cookbook' cert",
    );
    assert.ok(
      names.some((n: string) => /Certified ScrumMaster/i.test(n)),
      "Expected 'Certified ScrumMaster' cert",
    );
    assert.ok(
      names.some((n: string) => /Certified Scrum Product Owner/i.test(n)),
      "Expected 'Certified Scrum Product Owner' cert",
    );
  });

  it("extracts 10 skills from the bullet-separated Skills line", () => {
    assert.equal(skills.length, 10, `Expected 10 skills, got ${skills.length}`);
    const names = skills.map((s) => s.name);
    assert.deepEqual(names, [
      "Amazon Web Services (AWS)",
      "Strategic Planning",
      "Strategy",
      "Software Development",
      "Scrum",
      "Management",
      "SDLC",
      "Agile Methodologies",
      "Web Services",
      "Software Project Management",
    ]);
  });

  it("extracts 1 award from the Honors & Awards section", () => {
    assert.equal(awards.length, 1, `Expected 1 award, got ${awards.length}`);
    assert.ok(
      /Innovation Award/i.test(awards[0].title),
      `Expected Innovation Award, got ${awards[0].title}`,
    );
  });

  it("filters out 'Sean Hogg - page N' footer lines from cert/skill/award sections", () => {
    const allNames = [
      ...certificates.map((c) => c.name),
      ...skills.map((s) => s.name),
      ...awards.map((a) => a.title),
    ];
    for (const n of allNames) {
      assert.ok(
        !/Sean Hogg - page/i.test(n),
        `Page footer leaked into parsed output: "${n}"`,
      );
    }
  });

  it("buildMetaResume round-trip preserves all counts", () => {
    const meta = buildMetaResume(parsed, "sean-hogg-pdf", "Sean Hogg");
    assert.equal(meta.work.length, 9);
    assert.equal(meta.education.length, 2);
    assert.equal(meta.skills.length, 10);
    assert.ok(meta.certificates.length >= 12);
    assert.equal(meta.awards.length, 1);
  });
});
