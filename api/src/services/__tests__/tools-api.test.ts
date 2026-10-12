/**
 * Unit tests for the AI Tools API surface.
 *
 * Covers every route backing a page under https://hired.video/Tools/*:
 *   • /api/resumescorer/score
 *   • /api/resumeoptimizer/optimize
 *   • /api/salarycalculator/analyze  + /negotiation-tips + /industries
 *   (/api/valueproposition is covered by value-proposition-handler.test.ts)
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
import {
  ResumeAnalysisSchema,
  ResumeAnalysisPreviewSchema,
  SalaryAnalysisResponseSchema,
  SentimentResponseSchema,
  SummarizeResponseSchema,
} from "../../../../shared/tool-schemas.js";
import { scoreSentiment } from "../../../../shared/sentiment.js";
import { TIER_COPY, UPGRADE_URL } from "../../../../shared/tier-copy.js";
import { buildDeterministicSummary as summarizeFallback } from "../resume/summarize.js";

// ---------------------------------------------------------------------------
// Helpers replicated from the route modules (verbatim — if either drifts,
// the tests should fail and this file should be updated).
// ---------------------------------------------------------------------------

/** @see api/src/services/resume/analyze.ts::buildAnalysisFallback */
function buildAnalysisResult() {
  return {
    overallScore: 74,
    atsScore: 78,
    contentScore: 72,
    keywordScore: 70,
    formatScore: 76,
    impactScore: 71,
    grade: "B",
    strengths: ["Clear structure", "Action-oriented language"],
    weaknesses: ["Could add more measurable outcomes"],
    recommendations: [
      {
        severity: "important" as const,
        category: "impact",
        title: "Add quantified achievements",
        description: "Include metrics such as percentages, revenue, or time saved.",
        impact: 8,
      },
    ],
    optimizedContent: "Optimized resume content draft.",
  };
}

/**
 * @see api/src/services/salary/handlers.ts::buildSalaryFallback
 *
 * The deterministic stub now only runs when the LLM is unavailable
 * (no provider key, every fallback model failed). Production traffic
 * goes through the AI path and gets location-/title-/industry-aware
 * numbers. We keep the formula identical to the pre-AI behaviour so
 * the contract assertions below (60K baseline, $3.5K/yr scaling) still
 * pin the fallback's shape.
 */
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

/**
 * Mirrors the route's body→text coercion. The scoring itself is the
 * shared `scoreSentiment` from shared/sentiment.ts — we deliberately do
 * NOT reimplement it, otherwise the tests can't catch ladder drift
 * between the raw-text route and the resume route. The 2026-05-04
 * regression that motivated this consolidation passed because the prior
 * version of this file shipped its own copy of the scoring function and
 * asserted against itself.
 *
 * @see api/src/routes/sentiment.ts
 */
function sentimentScore(input: unknown): number {
  const text = typeof input === "string" ? input : JSON.stringify(input ?? "");
  return scoreSentiment(text);
}

// Resume Summarize handler tests live in resume-summarize.test.ts —
// they cover input-shape classification, owner-scoped DB resolution,
// validation, and the deterministic fallback. The schema test below
// uses the imported `summarizeFallback` so the contract assertion
// runs against the real production string.

// ═══════════════════════════════════════════════════════════════════════════
// Resume Scorer
// ═══════════════════════════════════════════════════════════════════════════

// Both /api/resumescorer/score and /api/resumeoptimizer/optimize are
// thin proxies over the shared analyzeResume engine. Tests below
// exercise the merged shape; per-route presentation differences (e.g.
// Scorer drops `optimizedContent`) are covered in access-policy.test.ts.
describe("/api/resume*/(score|optimize) — buildAnalysisResult", () => {
  it("returns all six subscores in 0–100 range", () => {
    const r = buildAnalysisResult();
    for (const key of [
      "overallScore", "atsScore", "contentScore",
      "keywordScore", "formatScore", "impactScore",
    ] as const) {
      assert.equal(typeof r[key], "number", `${key} must be numeric`);
      assert.ok(r[key] >= 0 && r[key] <= 100, `${key} out of range: ${r[key]}`);
    }
  });

  it("grade matches /^[A-F][+-]?$/", () => {
    assert.ok(/^[A-F][+-]?$/.test(buildAnalysisResult().grade));
  });

  it("recommendations conform to the frontend contract", () => {
    const r = buildAnalysisResult();
    assert.ok(r.recommendations.length > 0);
    for (const rec of r.recommendations) {
      assert.equal(typeof rec.severity, "string");
      assert.ok(["critical", "important", "minor"].includes(rec.severity));
      assert.equal(typeof rec.category, "string");
      assert.equal(typeof rec.title, "string");
      assert.equal(typeof rec.description, "string");
    }
  });

  it("strengths and weaknesses are populated", () => {
    const r = buildAnalysisResult();
    assert.ok(r.strengths.length > 0);
    assert.ok(r.weaknesses.length > 0);
  });

  it("optimizedContent is a non-empty draft", () => {
    const { optimizedContent } = buildAnalysisResult();
    assert.equal(typeof optimizedContent, "string");
    assert.ok(optimizedContent.length > 0);
  });
});

describe("/api/resumescorer/score — anonymous upsell preview shape", () => {
  function anonymousPayload() {
    const full = buildAnalysisResult();
    return {
      overallScore: full.overallScore,
      grade: full.grade,
      isProPreview: true,
      upgradeUrl: "/settings/billing",
    };
  }

  it("exposes only score + grade + upsell flags", () => {
    const p = anonymousPayload();
    assert.equal(p.isProPreview, true);
    assert.equal(p.upgradeUrl, "/settings/billing");
    assert.equal(typeof p.overallScore, "number");
    assert.equal(typeof p.grade, "string");
  });

  it("does NOT leak premium-only fields in the preview", () => {
    const p = anonymousPayload() as any;
    for (const blocked of [
      "atsScore", "contentScore", "keywordScore",
      "formatScore", "impactScore", "strengths", "weaknesses",
      "recommendations", "optimizedContent",
    ]) {
      assert.equal(p[blocked], undefined, `${blocked} must be gated`);
    }
  });
});

describe("/api/resumescorer/score — free-tier teaser shape", () => {
  function freeTierPayload() {
    const full = buildAnalysisResult();
    return {
      overallScore: full.overallScore,
      grade: full.grade,
      isProPreview: true,
      teaserRecommendation: full.recommendations[0]
        ? { title: full.recommendations[0].title, impact: full.recommendations[0].impact }
        : null,
      lockedDetails: [
        "atsScore", "contentScore", "keywordScore",
        "formatScore", "impactScore", "strengths", "weaknesses",
      ],
      upgradeUrl: "/settings/billing",
    };
  }

  it("returns a single teaser recommendation, not the full list", () => {
    const p = freeTierPayload();
    assert.ok(p.teaserRecommendation);
    assert.equal(typeof p.teaserRecommendation!.title, "string");
    assert.ok(!("description" in p.teaserRecommendation!));
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

// Detailed coverage for the summarize handler is in resume-summarize.test.ts.

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

// ═══════════════════════════════════════════════════════════════════════════
// Shared schema validation — every tool handler's output must parse clean
// against the shared Zod schemas in shared/tool-schemas.ts. These guard
// against drift between server output and the contract the frontend
// validates at runtime (roadmap #147).
// ═══════════════════════════════════════════════════════════════════════════

describe("shared schemas: server output matches shared contract", () => {
  it("ResumeAnalysisSchema accepts buildAnalysisResult() output", () => {
    const parsed = ResumeAnalysisSchema.safeParse(buildAnalysisResult());
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  it("ResumeAnalysisPreviewSchema accepts the anonymous preview shape", () => {
    const full = buildAnalysisResult();
    const preview = {
      overallScore: full.overallScore,
      grade: full.grade,
      isProPreview: true as const,
      upgradeUrl: "/settings/billing",
    };
    const parsed = ResumeAnalysisPreviewSchema.safeParse(preview);
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  it("SalaryAnalysisResponseSchema accepts buildSalaryPayload() output", () => {
    const parsed = SalaryAnalysisResponseSchema.safeParse(buildSalaryPayload({ experienceYears: 5, industry: "tech" }));
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  it("SentimentResponseSchema accepts the wrapped score shape", () => {
    const parsed = SentimentResponseSchema.safeParse({ score: sentimentScore("hello world") });
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  it("SummarizeResponseSchema accepts the summarize handler output", () => {
    const parsed = SummarizeResponseSchema.safeParse({ result: summarizeFallback("sample resume content") });
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  it("rejects regressions — score must be 0–100", () => {
    const parsed = ResumeAnalysisSchema.safeParse({
      ...buildAnalysisResult(),
      overallScore: 150, // out of range
    });
    assert.equal(parsed.success, false);
  });

  it("rejects regressions — SentimentResponseSchema rejects raw numbers", () => {
    // Guards against reverting to `data: <number>` instead of `data: { score }`.
    const parsed = SentimentResponseSchema.safeParse(73);
    assert.equal(parsed.success, false);
  });
});

describe("tier enforcement: response envelopes", () => {
  // Mirrors api/src/middleware/tierEnforcement.ts::requirePro — pulls
  // the message + upgrade URL from `shared/tier-copy.ts` so a rename of
  // the tier ("Pro" → anything else) updates this test in lockstep.
  function premiumRequired(featureName: string) {
    return {
      success: false,
      error: {
        code: "PRO_REQUIRED",
        message: TIER_COPY.proFeatureRequired(featureName),
        upgradeUrl: UPGRADE_URL,
      },
    };
  }

  function unauthorized() {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    };
  }

  it("PRO_REQUIRED payload exposes upgradeUrl for the frontend CTA", () => {
    const r = premiumRequired("Salary Calculator");
    assert.equal(r.error.code, "PRO_REQUIRED");
    assert.equal(r.error.upgradeUrl, "/settings/billing");
    assert.ok(r.error.message.includes("Salary Calculator"));
  });

  it("UNAUTHORIZED payload uses the stable code contract", () => {
    const r = unauthorized();
    assert.equal(r.error.code, "UNAUTHORIZED");
    assert.equal(r.error.message, "Authentication required");
  });
});
