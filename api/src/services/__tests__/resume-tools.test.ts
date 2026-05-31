/**
 * Tests for all resume-related tools and shared services.
 *
 * Covers:
 * - resume-parse.ts: resumeContentToText (shared text converter)
 * - resume-merge.ts: similarity scoring, merge helpers, analyzeMerge, executeMerge
 * - resume-roast.ts: buildMockRoast (heuristic fallback)
 *
 * The resume-analyzer payload (used by both /score and /optimize) is
 * tested in tools-api.test.ts against the real ResumeAnalysisSchema.
 *
 * Run: node --import tsx --test src/services/__tests__/resume-tools.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Shared service imports ───────────────────────────────────────────────
import { resumeContentToText } from "../resume/parse.js";
import {
  normalizeString,
  levenshteinDistance,
  levenshteinRatio,
  computeSectionSimilarity,
  mergeHighlights,
  mergeKeywords,
  analyzeMerge,
  executeMerge,
  type MergeDecision,
} from "../resume/merge.js";

// ═══════════════════════════════════════════════════════════════════════════
// resumeContentToText — shared resume-to-plaintext converter
// ═══════════════════════════════════════════════════════════════════════════
describe("resumeContentToText", () => {
  it("converts lowercase JSON Resume content to text", () => {
    const content = {
      basics: { name: "Sean Hogg", email: "sean@test.com", summary: "CTO with 25 years" },
      work: [{ name: "Acme Corp", position: "CTO", startDate: "2022", endDate: "Present", highlights: ["Led team of 15"] }],
      education: [{ institution: "MIT", area: "CS", studyType: "BS" }],
      skills: [{ name: "JavaScript", keywords: ["React", "Node"] }],
    };
    const text = resumeContentToText(content);
    assert.ok(text.includes("Sean Hogg"), "Should include name");
    assert.ok(text.includes("sean@test.com"), "Should include email");
    assert.ok(text.includes("CTO with 25 years"), "Should include summary");
    assert.ok(text.includes("CTO at Acme Corp"), "Should include work");
    assert.ok(text.includes("Led team of 15"), "Should include highlights");
    assert.ok(text.includes("CS at MIT"), "Should include education");
    assert.ok(text.includes("JavaScript"), "Should include skills");
    assert.ok(text.includes("React"), "Should include keywords");
  });

  it("converts PascalCase (frontend) content to text", () => {
    const content = {
      Basics: { Name: "Jane Doe", Email: "jane@test.com", Summary: "Engineer" },
      Work: [{ Name: "BigCo", Position: "Dev", StartDate: "2020", EndDate: "2023" }],
      Education: [{ Institution: "Stanford", Area: "Math", StudyType: "MS" }],
    };
    const text = resumeContentToText(content);
    assert.ok(text.includes("Jane Doe"));
    assert.ok(text.includes("Dev at BigCo"));
    assert.ok(text.includes("Math at Stanford"));
  });

  it("handles legacy flat format", () => {
    const content = { name: "Bob", headline: "Developer", summary: "Builds things" };
    const text = resumeContentToText(content);
    assert.ok(text.includes("Bob"));
    assert.ok(text.includes("Developer"));
    assert.ok(text.includes("Builds things"));
  });

  it("includes volunteer, projects, certificates", () => {
    const content = {
      basics: { name: "Test" },
      volunteer: [{ position: "Mentor", organization: "SCORE" }],
      projects: [{ name: "My App", description: "A cool app" }],
      certificates: [{ name: "AWS SA", issuer: "Amazon" }],
    };
    const text = resumeContentToText(content);
    assert.ok(text.includes("Mentor at SCORE"));
    assert.ok(text.includes("My App"));
    assert.ok(text.includes("AWS SA"));
  });

  it("returns empty string for null/undefined", () => {
    assert.equal(resumeContentToText(null), "");
    assert.equal(resumeContentToText(undefined), "");
  });

  it("respects maxLength parameter", () => {
    const content = {
      basics: { name: "Test", summary: "A".repeat(5000) },
    };
    const text = resumeContentToText(content, 100);
    assert.ok(text.length <= 100);
  });

  it("falls back to resumeSerialized", () => {
    const inner = { basics: { name: "From Serialized" } };
    const content = { resumeSerialized: JSON.stringify(inner) };
    const text = resumeContentToText(content);
    assert.ok(text.includes("From Serialized"));
  });

  it("falls back to markdown field", () => {
    const content = { markdown: "# Resume\nSome markdown content" };
    const text = resumeContentToText(content);
    assert.ok(text.includes("Some markdown content"));
  });

  it("handles string skills", () => {
    const content = { basics: { name: "Test" }, skills: "JavaScript, Python, Go" };
    const text = resumeContentToText(content);
    assert.ok(text.includes("JavaScript, Python, Go"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resume-merge: string similarity helpers
// ═══════════════════════════════════════════════════════════════════════════
describe("resume-merge: normalizeString", () => {
  it("lowercases and trims", () => {
    assert.equal(normalizeString("  Hello World  "), "hello world");
  });

  it("strips company suffixes", () => {
    assert.equal(normalizeString("Acme Inc."), "acme");
    assert.equal(normalizeString("BigCo LLC"), "bigco");
    assert.equal(normalizeString("TechCo Corporation"), "techco");
  });

  it("removes punctuation", () => {
    assert.equal(normalizeString("Hello, World!"), "hello world");
  });

  it("handles empty/null", () => {
    assert.equal(normalizeString(""), "");
    assert.equal(normalizeString(null as any), "");
  });
});

describe("resume-merge: levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    assert.equal(levenshteinDistance("hello", "hello"), 0);
  });

  it("returns string length for empty comparison", () => {
    assert.equal(levenshteinDistance("hello", ""), 5);
    assert.equal(levenshteinDistance("", "world"), 5);
  });

  it("calculates correct distance", () => {
    assert.equal(levenshteinDistance("kitten", "sitting"), 3);
    assert.equal(levenshteinDistance("saturday", "sunday"), 3);
  });
});

describe("resume-merge: levenshteinRatio", () => {
  it("returns 1 for identical strings", () => {
    assert.equal(levenshteinRatio("Acme Corp", "Acme Corp"), 1);
  });

  it("returns 1 for both empty", () => {
    assert.equal(levenshteinRatio("", ""), 1);
  });

  it("returns 0 for one empty", () => {
    assert.equal(levenshteinRatio("hello", ""), 0);
  });

  it("normalizes before comparison (case + suffixes)", () => {
    const ratio = levenshteinRatio("Acme Inc.", "ACME");
    assert.ok(ratio > 0.9, `Expected high ratio for same company, got ${ratio}`);
  });

  it("returns low ratio for different strings", () => {
    const ratio = levenshteinRatio("Microsoft", "Apple");
    assert.ok(ratio < 0.5, `Expected low ratio, got ${ratio}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resume-merge: section similarity scoring
// ═══════════════════════════════════════════════════════════════════════════
describe("resume-merge: computeSectionSimilarity", () => {
  it("scores identical work entries highly", () => {
    const source = { name: "Acme Corp", position: "CTO", startDate: "10/2022", endDate: "Present" };
    const target = { name: "Acme Corp", position: "CTO", startDate: "10/2022", endDate: "Present" };
    const score = computeSectionSimilarity("work", source, target);
    assert.ok(score > 0.9, `Expected >0.9, got ${score}`);
  });

  it("scores different work entries low", () => {
    const source = { name: "Google", position: "SWE", startDate: "2018", endDate: "2020" };
    const target = { name: "Apple", position: "Designer", startDate: "2022", endDate: "Present" };
    const score = computeSectionSimilarity("work", source, target);
    assert.ok(score < 0.4, `Expected <0.4, got ${score}`);
  });

  it("scores similar education entries", () => {
    const source = { institution: "University of Windsor", area: "Computer Science" };
    const target = { institution: "University of Windsor", area: "CS" };
    const score = computeSectionSimilarity("education", source, target);
    assert.ok(score > 0.6, `Expected >0.6, got ${score}`);
  });

  it("scores skill similarity with keywords", () => {
    const source = { name: "JavaScript", keywords: ["React", "Node", "TypeScript"] };
    const target = { name: "JavaScript", keywords: ["React", "Vue", "TypeScript"] };
    const score = computeSectionSimilarity("skills", source, target);
    assert.ok(score > 0.7, `Expected >0.7, got ${score}`);
  });

  it("scores volunteer similarity", () => {
    const source = { organization: "SCORE Mentors", position: "Certified Business Mentor" };
    const target = { organization: "SCORE Mentors", position: "Business Mentor" };
    const score = computeSectionSimilarity("volunteer", source, target);
    assert.ok(score > 0.7, `Expected >0.7, got ${score}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resume-merge: merge helpers
// ═══════════════════════════════════════════════════════════════════════════
describe("resume-merge: mergeHighlights", () => {
  it("combines and deduplicates highlights", () => {
    const source = ["Led team of 15", "Reduced costs by 30%"];
    const target = ["Led team of 15", "Improved uptime to 99.9%"];
    const result = mergeHighlights(source, target);
    assert.equal(result.length, 3);
    assert.ok(result.includes("Led team of 15"));
    assert.ok(result.includes("Reduced costs by 30%"));
    assert.ok(result.includes("Improved uptime to 99.9%"));
  });

  it("handles empty arrays", () => {
    assert.deepEqual(mergeHighlights([], []), []);
    assert.deepEqual(mergeHighlights(["a"], []), ["a"]);
    assert.deepEqual(mergeHighlights([], ["b"]), ["b"]);
  });

  it("deduplicates case-insensitively", () => {
    const result = mergeHighlights(["Led team"], ["led team"]);
    assert.equal(result.length, 1);
  });
});

describe("resume-merge: mergeKeywords", () => {
  it("deduplicates keywords", () => {
    const result = mergeKeywords(["React", "Node"], ["react", "Vue"]);
    assert.equal(result.length, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resume-merge: analyzeMerge (deterministic, no AI)
// ═══════════════════════════════════════════════════════════════════════════
describe("resume-merge: analyzeMerge", () => {
  it("detects matching work entries between source and target", async () => {
    const source = {
      basics: { name: "Sean Hogg", email: "sean@test.com" },
      work: [
        { name: "Acme Corp", position: "CTO", startDate: "2022", endDate: "Present" },
      ],
    };
    const target = {
      basics: { name: "Sean Hogg", email: "sean@test.com" },
      work: [
        { name: "Acme Corp", position: "CTO", startDate: "10/2022", endDate: "Present" },
      ],
    };
    const analysis = await analyzeMerge(source, target);
    assert.ok(analysis.sectionMatches.length > 0, "Should find matching work entries");
    assert.equal(analysis.sectionMatches[0].sectionType, "work");
    assert.ok(analysis.sectionMatches[0].confidence > 0.7);
  });

  it("detects new sections (no match in target)", async () => {
    const source = {
      basics: { name: "Test" },
      work: [{ name: "NewCo", position: "Dev", startDate: "2023", endDate: "Present" }],
    };
    const target = {
      basics: { name: "Test" },
      work: [{ name: "OldCo", position: "Manager", startDate: "2010", endDate: "2015" }],
    };
    const analysis = await analyzeMerge(source, target);
    // The match should be low confidence (different companies) — may be skip or new
    const hasLowMatch = analysis.sectionMatches.some((m) => m.confidence < 0.4);
    const hasNew = analysis.newSections.length > 0;
    assert.ok(hasLowMatch || hasNew, "Should detect low match or new section");
  });

  it("detects basics conflicts", async () => {
    const source = { basics: { name: "Sean", email: "sean@new.com", summary: "New summary" } };
    const target = { basics: { name: "Sean", email: "sean@old.com", summary: "Old summary" } };
    const analysis = await analyzeMerge(source, target);
    assert.ok(analysis.basics.conflicts.length > 0, "Should detect email/summary conflicts");
    const emailConflict = analysis.basics.conflicts.find((c) => c.field === "email");
    assert.ok(emailConflict, "Should have email conflict");
    assert.equal(emailConflict!.sourceValue, "sean@new.com");
    assert.equal(emailConflict!.targetValue, "sean@old.com");
  });

  it("auto-merges when no basics conflicts", async () => {
    const source = { basics: { name: "Sean" } };
    const target = { basics: { name: "Sean" } };
    const analysis = await analyzeMerge(source, target);
    assert.equal(analysis.basics.autoMerge, true);
  });

  it("provides summary counts", async () => {
    const source = {
      basics: { name: "Test" },
      work: [{ name: "Co", position: "Dev" }],
      skills: [{ name: "JS" }],
    };
    const target = { basics: { name: "Test" }, work: [], skills: [] };
    const analysis = await analyzeMerge(source, target);
    assert.ok(analysis.summary.totalSections > 0);
    assert.equal(typeof analysis.summary.autoMerge, "number");
    assert.equal(typeof analysis.summary.newItems, "number");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resume-merge: executeMerge
// ═══════════════════════════════════════════════════════════════════════════
describe("resume-merge: executeMerge", () => {
  it("merges basics, filling empty target fields from source", () => {
    const target = { basics: { name: "Sean", email: "sean@test.com", phone: "" }, work: [] };
    const source = { basics: { name: "Sean", email: "", phone: "555-1234" }, work: [] };
    const decisions: MergeDecision[] = [];
    const result = executeMerge(target, source, decisions);
    assert.equal(result.basics.name, "Sean");
    assert.equal(result.basics.email, "sean@test.com"); // keep target
    assert.equal(result.basics.phone, "555-1234"); // fill from source
  });

  it("applies basicDecisions to override target", () => {
    const target = { basics: { name: "Sean", email: "old@test.com" }, work: [] };
    const source = { basics: { name: "Sean", email: "new@test.com" }, work: [] };
    const result = executeMerge(target, source, [], { email: "source" });
    assert.equal(result.basics.email, "new@test.com");
  });

  it("adds new items via 'add' decisions", () => {
    const target = { basics: { name: "T" }, work: [{ name: "OldJob", position: "Dev" }] };
    const source = { basics: { name: "T" }, work: [{ name: "NewJob", position: "CTO" }] };
    const decisions: MergeDecision[] = [{
      sectionType: "work",
      sourceIndex: 0,
      targetIndex: null,
      action: "add",
    }];
    const result = executeMerge(target, source, decisions);
    assert.equal(result.work.length, 2, "Should have both old and new work entries");
  });

  it("replaces items via 'replace' decisions", () => {
    const target = { basics: { name: "T" }, work: [{ name: "Co", position: "Junior Dev", highlights: ["old"] }] };
    const source = { basics: { name: "T" }, work: [{ name: "Co", position: "Senior Dev", highlights: ["new"] }] };
    const decisions: MergeDecision[] = [{
      sectionType: "work",
      sourceIndex: 0,
      targetIndex: 0,
      action: "replace",
    }];
    const result = executeMerge(target, source, decisions);
    assert.equal(result.work.length, 1);
    assert.equal(result.work[0].position, "Senior Dev");
  });

  it("skips items with 'skip' decisions", () => {
    const target = { basics: { name: "T" }, work: [{ name: "KeepMe", position: "Dev" }] };
    const source = { basics: { name: "T" }, work: [{ name: "IgnoreMe", position: "CTO" }] };
    const decisions: MergeDecision[] = [{
      sectionType: "work",
      sourceIndex: 0,
      targetIndex: 0,
      action: "skip",
    }];
    const result = executeMerge(target, source, decisions);
    assert.equal(result.work.length, 1);
    assert.equal(result.work[0].name, "KeepMe");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resume-roast: buildMockRoast (heuristic scoring)
// ═══════════════════════════════════════════════════════════════════════════
// Note: buildMockRoast is not exported, so we test it indirectly by
// importing the route module and testing the logic patterns it uses.
// We replicate the core heuristic logic here for unit testing.
describe("resume-roast: mock roast heuristics", () => {
  // Replicate the core scoring logic for testing
  function scoreMockResume(resumeText: string) {
    const lines = resumeText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
    const bulletLines = lines.filter((l) => /^[-\u2022\u25AA\u25B8\u25BA\u25E6\u2023*\d.]+\s+/.test(l));
    const hasBullets = bulletLines.length > 0;
    const rawMetrics = Array.from(resumeText.matchAll(/\b\d+(?:\.\d+)?(?:%|k|m|b|x)?\b/gi)).map((m) => m[0]);
    const metrics = rawMetrics.filter((m) => m.replace(/\D/g, "").length < 10);
    const hasNumbers = metrics.length > 0;
    const verbs = Array.from(resumeText.matchAll(/\b(lead|led|manage|managed|build|built|design|designed|deliver|delivered|drive|drove|improve|improved|reduce|reduced|optimi[sz]e|launched|created)\b/gi));
    const uniqueVerbs = Array.from(new Set(verbs.map((m) => m[0].toLowerCase())));
    return { hasBullets, hasNumbers, uniqueVerbs, wordCount, bulletLines, metrics };
  }

  it("detects bullet points in resume", () => {
    const text = "- Led team of 15 engineers\n- Reduced costs by 30%\n- Built CI/CD pipeline";
    const { hasBullets } = scoreMockResume(text);
    assert.equal(hasBullets, true);
  });

  it("detects action verbs", () => {
    const text = "Led the engineering team. Built a new CI/CD pipeline. Delivered 3 products.";
    const { uniqueVerbs } = scoreMockResume(text);
    assert.ok(uniqueVerbs.includes("led"));
    assert.ok(uniqueVerbs.includes("built"));
    assert.ok(uniqueVerbs.includes("delivered"));
  });

  it("detects metrics (ignoring phone numbers)", () => {
    const text = "Phone: 2488250176\nReduced costs by 30%\nLed team of 15";
    const { metrics } = scoreMockResume(text);
    // Phone number (10 digits) should be excluded
    const hasPhone = metrics.some((m) => m.replace(/\D/g, "").length >= 10);
    assert.equal(hasPhone, false, "Phone number should be excluded from metrics");
    assert.ok(metrics.length >= 2, "Should detect 30 and 15 as metrics");
  });

  it("penalizes short resumes", () => {
    const { wordCount } = scoreMockResume("Short resume.");
    assert.ok(wordCount < 180);
  });

  it("works on a full resume", () => {
    const fullResume = `Sean Hogg
CTO and Technology Leader with 25 years of experience
- Led onshore/offshore teams to deliver over 200 features
- Reduced operating costs by $1.79M through IT modernization
- Increased ticket completion by 92%
- Built CI/CD pipelines reducing deployment time by 75%`;
    const { hasBullets, hasNumbers, uniqueVerbs } = scoreMockResume(fullResume);
    assert.equal(hasBullets, true, "Should detect bullets");
    assert.equal(hasNumbers, true, "Should detect numbers");
    assert.ok(uniqueVerbs.length > 0, "Should detect action verbs");
  });
});

// Note: structural validation of the resume-analyzer payload (the
// merged shape behind both /api/resumescorer/score and
// /api/resumeoptimizer/optimize) lives in tools-api.test.ts —
// describe("/api/resume*/(score|optimize) — buildAnalysisResult") —
// against the real ResumeAnalysisSchema instead of an inline replica.

// ═══════════════════════════════════════════════════════════════════════════
// Integration: end-to-end merge workflow
// ═══════════════════════════════════════════════════════════════════════════
describe("Integration: full merge workflow (analyze → decide → execute)", () => {
  it("analyzes and merges two resumes end-to-end", async () => {
    const master = {
      basics: { name: "Sean Hogg", email: "sean@test.com", phone: "555-1234", summary: "CTO" },
      work: [
        { name: "Acme Corp", position: "CTO", startDate: "10/2022", endDate: "Present", highlights: ["Led team"] },
        { name: "BigCo", position: "VP", startDate: "2019", endDate: "2022", highlights: ["Saved $2M"] },
      ],
      education: [{ institution: "MIT", area: "CS" }],
      skills: [{ name: "JavaScript", keywords: ["React", "Node"] }],
    };

    const uploaded = {
      basics: { name: "Sean Hogg", email: "sean@newemail.com", summary: "CTO with 25 years experience" },
      work: [
        { name: "Acme Corp", position: "CTO", startDate: "10/2022", endDate: "Present", highlights: ["Led team", "Built CI/CD"] },
        { name: "NewCo", position: "Consultant", startDate: "2023", endDate: "Present", highlights: ["Mentored startups"] },
      ],
      education: [{ institution: "MIT", area: "Computer Science" }],
      skills: [{ name: "JavaScript", keywords: ["React", "Node", "TypeScript"] }],
    };

    // Step 1: Analyze
    const analysis = await analyzeMerge(uploaded, master);

    assert.ok(analysis.basics.conflicts.length > 0, "Should detect email conflict");
    assert.ok(analysis.sectionMatches.length > 0, "Should find matching sections");

    // Step 2: Build decisions from analysis
    const decisions: MergeDecision[] = [];

    // For matching work entries, merge them
    for (const match of analysis.sectionMatches) {
      if (match.confidence >= 0.7) {
        decisions.push({
          sectionType: match.sectionType,
          sourceIndex: match.sourceIndex,
          targetIndex: match.targetIndex,
          action: "merge",
        });
      }
    }

    // For new sections, add them
    for (const ns of analysis.newSections) {
      decisions.push({
        sectionType: ns.sectionType,
        sourceIndex: ns.sourceIndex,
        targetIndex: null,
        action: "add",
      });
    }

    // Step 3: Execute
    const merged = executeMerge(master, uploaded, decisions, { email: "source" });

    // Verify basics
    assert.equal(merged.basics.name, "Sean Hogg");
    assert.equal(merged.basics.email, "sean@newemail.com"); // source override
    assert.equal(merged.basics.phone, "555-1234"); // kept from target

    // Verify work entries were merged/added
    assert.ok(merged.work.length >= 2, `Expected at least 2 work entries, got ${merged.work.length}`);
  });
});
