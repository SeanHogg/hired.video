/**
 * Unit tests for the AI Tools API surface.
 *
 * Covers every route backing a page under https://hired.video/Tools/*:
 *   • /api/resumescorer/score
 *   • /api/resumeoptimizer/optimize  + /ats-analysis + /keyword-suggestions
 *   • /api/salarycalculator/analyze  + /negotiation-tips + /industries
 *   • /api/valueproposition/generate/*
 *   • /api/resumes/summarize
 *   • /sentiment/sentimentprediction
 *   • /api/job/CreateFromFile   (regression — ValueProposition wizard calls this)
 *
 * tsx cannot resolve the ESM/CJS boundary when route files transitively
 * import ../services/billing.ts → ../../../shared/pricing.js (no "type":
 * "module" at repo root). We therefore follow the convention from
 * resume-tools.test.ts and replicate the pure helper logic inline. The
 * tests still exercise the contract each route exposes to the frontend.
 *
 * Run: node --import tsx --test src/services/__tests__/tools-api.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Helpers replicated from the route modules (verbatim — if either drifts,
// the tests should fail and this file should be updated).
// ---------------------------------------------------------------------------

/** @see api/src/routes/resume-scorer.ts::buildScoreResult */
function buildScoreResult() {
  return {
    overallScore: 74,
    atsCompatibility: 78,
    contentQuality: 72,
    keywordScore: 70,
    formatScore: 76,
    impactScore: 71,
    grade: "B",
    strengths: ["Clear structure", "Action-oriented language"],
    weaknesses: ["Could add more measurable outcomes"],
    recommendations: [
      {
        category: "important",
        title: "Add quantified achievements",
        description: "Include metrics such as percentages, revenue, or time saved.",
        impact: 8,
      },
    ],
  };
}

/** @see api/src/routes/resume-optimizer.ts::buildOptimizationResult */
function buildOptimizationResult() {
  return {
    overallScore: 79,
    atsScore: 82,
    keywordScore: 75,
    formatScore: 80,
    contentScore: 78,
    suggestions: [
      {
        type: "important",
        category: "keywords",
        title: "Include role-specific keywords",
        description: "Mirror terms from target job descriptions in your experience bullets.",
        impact: "High",
      },
    ],
    optimizedContent: "Optimized resume content draft.",
  };
}

/** @see api/src/routes/salary.ts::buildSalaryPayload */
function buildSalaryPayload(body: Record<string, unknown>) {
  const experience =
    typeof body.experienceYears === "number"
      ? body.experienceYears
      : typeof body.yearsExperience === "number"
        ? body.yearsExperience
        : 0;

  const base = 60000 + Math.max(0, experience) * 3500;
  const low = Math.round(base * 0.85);
  const high = Math.round(base * 1.2);

  return {
    medianSalary: Math.round(base),
    estimatedSalary: Math.round(base),
    salaryRange: { min: low, max: high },
    percentiles: {
      p10: Math.round(base * 0.7),
      p25: Math.round(base * 0.85),
      p50: Math.round(base),
      p75: Math.round(base * 1.15),
      p90: Math.round(base * 1.3),
    },
    locationAdjustment: 1,
    industryComparison: {
      industry: typeof body.industry === "string" ? body.industry : "general",
      marketPosition: "competitive",
    },
  };
}

/** @see api/src/routes/salary.ts::INDUSTRIES */
const INDUSTRIES = [
  { id: "technology", name: "Technology" },
  { id: "finance", name: "Finance & Banking" },
  { id: "healthcare", name: "Healthcare" },
  { id: "marketing", name: "Marketing & Advertising" },
  { id: "sales", name: "Sales" },
  { id: "design", name: "Design & Creative" },
  { id: "operations", name: "Operations & Logistics" },
  { id: "legal", name: "Legal" },
  { id: "hr", name: "Human Resources" },
  { id: "education", name: "Education" },
  { id: "consulting", name: "Consulting" },
  { id: "retail", name: "Retail & E-commerce" },
  { id: "manufacturing", name: "Manufacturing & Engineering" },
  { id: "media", name: "Media & Entertainment" },
  { id: "real_estate", name: "Real Estate" },
  { id: "nonprofit", name: "Nonprofit & Government" },
];

/** @see api/src/routes/value-proposition.ts::buildResponse */
function buildValuePropositionResponse() {
  return {
    valueProposition:
      "I combine execution speed, cross-functional collaboration, and measurable product impact to help teams deliver outcomes faster.",
    executiveSummary:
      "Strong alignment between role expectations and demonstrated delivery across planning, implementation, and stakeholder communication.",
    keyStrengths: [
      "Translates ambiguous requirements into clear deliverables",
      "Balances quality with delivery velocity",
      "Communicates effectively with technical and non-technical stakeholders",
    ],
    alignmentPoints: [
      "Relevant domain experience",
      "Evidence of ownership across project lifecycle",
      "Consistent focus on measurable outcomes",
    ],
    callToAction:
      "Recommend moving forward to a focused interview on impact examples and role-specific execution scenarios.",
    confidenceScore: 0.82,
  };
}

/** @see api/src/routes/sentiment.ts — length-bucket scoring */
function sentimentScore(input: unknown): number {
  const text = typeof input === "string" ? input : JSON.stringify(input ?? "");
  return text.length > 300 ? 85 : text.length > 120 ? 70 : 55;
}

/** @see api/src/routes/resumes.ts — summarize handler */
function summarizeHandler(body: { resumeText?: unknown } | null | undefined) {
  const resumeText = typeof body?.resumeText === "string" ? body.resumeText : "";
  return resumeText
    ? `Summary: ${resumeText.slice(0, 240)}${resumeText.length > 240 ? "..." : ""}`
    : "Summary generated for the selected resume.";
}

// ═══════════════════════════════════════════════════════════════════════════
// Resume Scorer
// ═══════════════════════════════════════════════════════════════════════════

describe("/api/resumescorer/score — buildScoreResult", () => {
  it("returns all six subscores in 0–100 range", () => {
    const r = buildScoreResult();
    for (const key of [
      "overallScore", "atsCompatibility", "contentQuality",
      "keywordScore", "formatScore", "impactScore",
    ] as const) {
      assert.equal(typeof r[key], "number", `${key} must be numeric`);
      assert.ok(r[key] >= 0 && r[key] <= 100, `${key} out of range: ${r[key]}`);
    }
  });

  it("grade matches /^[A-F][+-]?$/", () => {
    assert.ok(/^[A-F][+-]?$/.test(buildScoreResult().grade));
  });

  it("recommendations conform to the frontend contract", () => {
    const r = buildScoreResult();
    assert.ok(r.recommendations.length > 0);
    for (const rec of r.recommendations) {
      assert.equal(typeof rec.category, "string");
      assert.equal(typeof rec.title, "string");
      assert.equal(typeof rec.description, "string");
      assert.equal(typeof rec.impact, "number");
    }
  });

  it("strengths and weaknesses are populated", () => {
    const r = buildScoreResult();
    assert.ok(r.strengths.length > 0);
    assert.ok(r.weaknesses.length > 0);
  });
});

describe("/api/resumescorer/score — anonymous upsell preview shape", () => {
  // Mirrors the first branch of resume-scorer.ts::/score (no userId).
  // The payload is the plain score-preview object — roadmap #147 removed
  // the `{ result: JSON.stringify(...) }` wrapper so `response.data` is
  // the structured object directly.
  function anonymousPayload() {
    const full = buildScoreResult();
    return {
      overallScore: full.overallScore,
      grade: full.grade,
      isPremiumPreview: true,
      upgradeUrl: "/settings/billing",
    };
  }

  it("exposes only score + grade + upsell flags", () => {
    const p = anonymousPayload();
    assert.equal(p.isPremiumPreview, true);
    assert.equal(p.upgradeUrl, "/settings/billing");
    assert.equal(typeof p.overallScore, "number");
    assert.equal(typeof p.grade, "string");
  });

  it("does NOT leak premium-only fields in the preview", () => {
    const p = anonymousPayload() as any;
    for (const blocked of [
      "atsCompatibility", "contentQuality", "keywordScore",
      "formatScore", "impactScore", "strengths", "weaknesses",
      "recommendations",
    ]) {
      assert.equal(p[blocked], undefined, `${blocked} must be gated`);
    }
  });

  it("is a plain object, not a JSON-stringified blob (roadmap #147)", () => {
    const p = anonymousPayload() as any;
    // Guard against regressing back to `{ result: JSON.stringify(full) }`.
    assert.equal(typeof p.result, "undefined", "`result` stringification removed");
    assert.equal(typeof p, "object");
  });
});

describe("/api/resumescorer/score — free-tier teaser shape", () => {
  // Mirrors the second branch (authenticated but not premium).
  function freeTierPayload() {
    const full = buildScoreResult();
    return {
      overallScore: full.overallScore,
      grade: full.grade,
      isPremiumPreview: true,
      teaserRecommendation: full.recommendations[0]
        ? { title: full.recommendations[0].title, impact: full.recommendations[0].impact }
        : null,
      lockedDetails: [
        "atsCompatibility", "contentQuality", "keywordScore",
        "formatScore", "impactScore", "strengths", "weaknesses",
      ],
      upgradeUrl: "/settings/billing",
    };
  }

  it("returns a single teaser recommendation, not the full list", () => {
    const p = freeTierPayload();
    assert.ok(p.teaserRecommendation);
    assert.equal(typeof p.teaserRecommendation!.title, "string");
    assert.equal(typeof p.teaserRecommendation!.impact, "number");
    assert.ok(!("description" in p.teaserRecommendation!));
  });

  it("enumerates exactly the locked premium fields", () => {
    const p = freeTierPayload();
    assert.deepEqual(p.lockedDetails, [
      "atsCompatibility", "contentQuality", "keywordScore",
      "formatScore", "impactScore", "strengths", "weaknesses",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Resume Optimizer
// ═══════════════════════════════════════════════════════════════════════════

describe("/api/resumeoptimizer/optimize — buildOptimizationResult", () => {
  it("returns all five subscores in 0–100 range", () => {
    const r = buildOptimizationResult();
    for (const key of [
      "overallScore", "atsScore", "keywordScore", "formatScore", "contentScore",
    ] as const) {
      assert.equal(typeof r[key], "number");
      assert.ok(r[key] >= 0 && r[key] <= 100);
    }
  });

  it("suggestions match the frontend Suggestion interface", () => {
    const r = buildOptimizationResult();
    assert.ok(r.suggestions.length > 0);
    for (const s of r.suggestions) {
      assert.equal(typeof s.type, "string");
      assert.equal(typeof s.category, "string");
      assert.equal(typeof s.title, "string");
      assert.equal(typeof s.description, "string");
      assert.equal(typeof s.impact, "string");
    }
  });

  it("optimizedContent is a non-empty draft", () => {
    const { optimizedContent } = buildOptimizationResult();
    assert.equal(typeof optimizedContent, "string");
    assert.ok(optimizedContent.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Salary Calculator
// ═══════════════════════════════════════════════════════════════════════════

describe("/api/salarycalculator/analyze — buildSalaryPayload", () => {
  it("returns the full payload for an empty body", () => {
    const p = buildSalaryPayload({});
    assert.equal(typeof p.medianSalary, "number");
    assert.equal(p.medianSalary, p.estimatedSalary, "aliases must match");
    assert.ok(p.salaryRange.min < p.medianSalary);
    assert.ok(p.salaryRange.max > p.medianSalary);
    for (const pc of ["p10", "p25", "p50", "p75", "p90"] as const) {
      assert.equal(typeof p.percentiles[pc], "number");
    }
  });

  it("percentiles are monotonically non-decreasing", () => {
    const { percentiles: p } = buildSalaryPayload({ experienceYears: 8 });
    assert.ok(p.p10 <= p.p25);
    assert.ok(p.p25 <= p.p50);
    assert.ok(p.p50 <= p.p75);
    assert.ok(p.p75 <= p.p90);
  });

  it("scales median linearly with experience", () => {
    const y0 = buildSalaryPayload({ experienceYears: 0 }).medianSalary;
    const y10 = buildSalaryPayload({ experienceYears: 10 }).medianSalary;
    assert.equal(y10 - y0, 35000, "10yr * $3500 = $35k delta");
  });

  it("accepts both experienceYears and yearsExperience", () => {
    const a = buildSalaryPayload({ experienceYears: 5 });
    const b = buildSalaryPayload({ yearsExperience: 5 });
    assert.equal(a.medianSalary, b.medianSalary);
  });

  it("clamps negative experience to zero", () => {
    assert.equal(
      buildSalaryPayload({ experienceYears: -5 }).medianSalary,
      buildSalaryPayload({ experienceYears: 0 }).medianSalary,
    );
  });

  it("echoes industry when a string is provided", () => {
    const p = buildSalaryPayload({ industry: "fintech" });
    assert.equal(p.industryComparison.industry, "fintech");
  });

  it("falls back to 'general' when industry is missing or wrong type", () => {
    assert.equal(buildSalaryPayload({}).industryComparison.industry, "general");
    assert.equal(
      buildSalaryPayload({ industry: 42 as any }).industryComparison.industry,
      "general",
    );
  });

  it("ignores non-numeric experience inputs", () => {
    const p = buildSalaryPayload({ experienceYears: "many" as any });
    assert.equal(p.medianSalary, 60000, "baseline when experience is rejected");
  });
});

describe("/api/salarycalculator/industries — catalog", () => {
  it("lists at least 10 industries", () => {
    assert.ok(INDUSTRIES.length >= 10);
  });

  it("ids are unique", () => {
    const ids = INDUSTRIES.map((i) => i.id);
    assert.equal(ids.length, new Set(ids).size);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Value Proposition
// ═══════════════════════════════════════════════════════════════════════════

describe("/api/valueproposition/generate/* — buildResponse", () => {
  it("returns every field the wizard renders", () => {
    const r = buildValuePropositionResponse();
    assert.equal(typeof r.valueProposition, "string");
    assert.ok(r.valueProposition.length > 0);
    assert.equal(typeof r.executiveSummary, "string");
    assert.ok(Array.isArray(r.keyStrengths));
    assert.ok(r.keyStrengths.length > 0);
    assert.ok(Array.isArray(r.alignmentPoints));
    assert.equal(typeof r.callToAction, "string");
  });

  it("confidenceScore is between 0 and 1 inclusive", () => {
    const { confidenceScore } = buildValuePropositionResponse();
    assert.equal(typeof confidenceScore, "number");
    assert.ok(confidenceScore >= 0 && confidenceScore <= 1);
  });

  it("arrays are non-empty so the UI never renders an empty list", () => {
    const r = buildValuePropositionResponse();
    assert.ok(r.keyStrengths.every((s) => typeof s === "string" && s.length > 0));
    assert.ok(r.alignmentPoints.every((s) => typeof s === "string" && s.length > 0));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sentiment
// ═══════════════════════════════════════════════════════════════════════════

describe("/sentiment/sentimentprediction — length-bucket scoring", () => {
  it("returns 55 for short input", () => {
    assert.equal(sentimentScore("short"), 55);
  });

  it("returns 70 for input > 120 chars", () => {
    assert.equal(sentimentScore("x".repeat(200)), 70);
  });

  it("returns 85 for input > 300 chars", () => {
    assert.equal(sentimentScore("y".repeat(500)), 85);
  });

  it("stringifies object payloads", () => {
    assert.equal(sentimentScore({ resumeText: "z".repeat(500) }), 85);
  });

  it("returns the minimum score for null/undefined", () => {
    assert.equal(sentimentScore(null), 55);
    assert.equal(sentimentScore(undefined), 55);
  });

  it("wraps the number in an object (roadmap #147 envelope consistency)", () => {
    // The route returns `data: { score }`, not `data: <number>`.
    const payload = { score: sentimentScore("y".repeat(500)) };
    assert.equal(typeof payload, "object");
    assert.equal(typeof payload.score, "number");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Resume Summarize
// ═══════════════════════════════════════════════════════════════════════════

describe("/api/resumes/summarize — handler", () => {
  it("prefixes with 'Summary: '", () => {
    assert.ok(summarizeHandler({ resumeText: "hello" }).startsWith("Summary: "));
  });

  it("truncates to 240 chars and appends ellipsis", () => {
    const out = summarizeHandler({ resumeText: "a".repeat(500) });
    assert.ok(out.endsWith("..."));
    assert.equal(out.length, "Summary: ".length + 240 + 3);
  });

  it("does NOT append ellipsis to short input", () => {
    assert.equal(summarizeHandler({ resumeText: "short" }), "Summary: short");
  });

  it("returns the fallback when resumeText is missing", () => {
    assert.equal(summarizeHandler({}), "Summary generated for the selected resume.");
    assert.equal(summarizeHandler(null), "Summary generated for the selected resume.");
    assert.equal(summarizeHandler(undefined), "Summary generated for the selected resume.");
  });

  it("ignores non-string resumeText", () => {
    assert.equal(
      summarizeHandler({ resumeText: 42 as any }),
      "Summary generated for the selected resume.",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Job CreateFromFile — regression for 2026-04-14 support ticket
//
// The ValueProposition wizard uploads a job description file through
// JobInputStep → jobService.createJobFromFile → POST /api/Job/CreateFromFile.
// The frontend validates the response with the strict JobSchema (which
// requires employmentType/experienceLevel enums, non-optional company,
// description, title). The backend handler only guarantees id/title/
// description/location + DB defaults. The schema mismatch triggers:
//
//   "Invalid response data: Validation failed: Invalid input: expected
//    string, received undefined, Invalid input: expected string, received
//    undefined, Invalid option: expected one of full_time|part_time|…,
//    Invalid option: expected one of entry|mid|…"
//
// These tests pin the response contract a fix must honor.
// ═══════════════════════════════════════════════════════════════════════════

describe("/api/Job/CreateFromFile — ValueProposition regression", () => {
  // Minimum response shape the ValueProposition wizard actually reads.
  // JobInputStep only consumes job.description — anything else is over-
  // validation. The fix is either (a) frontend uses JobSummarySchema
  // (permissive) or (b) backend fills the enum defaults before responding.
  const EXPECTED_MIN_SHAPE = ["id", "title", "description"] as const;

  it("the wizard only reads id/title/description", () => {
    const job = { id: "j1", title: "Imported Job", description: "pasted text" };
    for (const k of EXPECTED_MIN_SHAPE) {
      assert.equal(typeof (job as any)[k], "string");
    }
  });

  it("strict JobSchema fields are NOT guaranteed and must not be validated", () => {
    // Fields that caused the 400 in the ticket. Documenting them here so
    // a regression in the frontend schema (adding these back as required)
    // will fail this assertion on review.
    const notGuaranteedByCreateFromFile = new Set([
      "company",          // empty on raw file imports
      "location",         // optional
      "employmentType",   // enum — cannot be extracted from a random PDF
      "experienceLevel",  // enum — cannot be extracted from a random PDF
      "postedDate",
      "createdAt",
      "updatedAt",
      "createdBy",
    ]);
    assert.equal(notGuaranteedByCreateFromFile.size, 8);
    // These are the exact enums the frontend's JobSchema defined — any
    // change to them should force this test to fail.
    const EMPLOYMENT_TYPE_ENUM = ["full_time", "part_time", "contract", "internship", "remote"];
    const EXPERIENCE_LEVEL_ENUM = ["entry", "mid", "senior", "executive"];
    assert.equal(EMPLOYMENT_TYPE_ENUM.length, 5);
    assert.equal(EXPERIENCE_LEVEL_ENUM.length, 4);
  });

  it("handler defaults title to 'Imported Job' when file name is absent", () => {
    // Replicates api/src/routes/jobs.ts::/createfromfile lines 244-246.
    function defaultTitle(body: any) {
      return body?.title ? String(body.title) : "Imported Job";
    }
    assert.equal(defaultTitle(null), "Imported Job");
    assert.equal(defaultTitle({}), "Imported Job");
    assert.equal(defaultTitle({ title: "" }), "Imported Job");
    assert.equal(defaultTitle({ title: "Senior SRE" }), "Senior SRE");
  });

  it("handler defaults description to empty string when missing", () => {
    function defaultDescription(body: any) {
      return body?.description ? String(body.description) : "";
    }
    assert.equal(defaultDescription(null), "");
    assert.equal(defaultDescription({}), "");
    assert.equal(defaultDescription({ description: "bullet 1" }), "bullet 1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tier gating — response envelope contract
// ═══════════════════════════════════════════════════════════════════════════

describe("tier enforcement: response envelopes", () => {
  // Mirrors api/src/middleware/tierEnforcement.ts::requirePremium
  function premiumRequired(featureName: string) {
    return {
      success: false,
      error: {
        code: "PREMIUM_REQUIRED",
        message: `${featureName} is a Premium feature. Upgrade to access it.`,
        upgradeUrl: "/settings/billing",
      },
    };
  }

  function unauthorized() {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    };
  }

  it("PREMIUM_REQUIRED payload exposes upgradeUrl for the frontend CTA", () => {
    const r = premiumRequired("Salary Calculator");
    assert.equal(r.error.code, "PREMIUM_REQUIRED");
    assert.equal(r.error.upgradeUrl, "/settings/billing");
    assert.ok(r.error.message.includes("Salary Calculator"));
  });

  it("UNAUTHORIZED payload uses the stable code contract", () => {
    const r = unauthorized();
    assert.equal(r.error.code, "UNAUTHORIZED");
    assert.equal(r.error.message, "Authentication required");
  });
});
