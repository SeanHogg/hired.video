/**
 * #374 — the analyzer returns structured, zod-validated actions. The lenient
 * ingest accepts what free-tier models really emit (drifted severity and
 * category words, invented wand ids, args that don't fit) and the coerce
 * step keeps the recommendation but only a VALID action. Fixtures are shaped
 * like real analyzer answers (gateway JSON for a director-level résumé).
 *
 * Run: node --import tsx --test src/services/resume/__tests__/analyze-actions.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ResumeAnalysisIngest, buildAnalysisFallback, coerceRecommendation } from "../analyze.js";
import {
  ResumeAnalysisSchema,
  WAND_ACTION_IDS,
  WAND_ACTION_ARGS,
  parseRecommendationAction,
} from "../../../../../shared/tool-schemas.js";

/** A real-shaped gateway answer: mixed vocab, one bad action, one bad args. */
const MODEL_ANSWER = {
  overallScore: 71,
  atsScore: 78,
  contentScore: 70,
  keywordScore: 64,
  formatScore: 74,
  impactScore: 61,
  grade: "B-",
  strengths: ['Clear progression from "IT Manager" to "Director of IT"', "Consistent use of action verbs in recent roles"],
  weaknesses: ['Bullets like "Responsible for vendor management" state duties, not results', "Dates mix 'Jan 2019' and '2019-03'"],
  recommendations: [
    {
      severity: "high",
      category: "Impact",
      title: "Add a measurable outcome to the vendor bullet",
      description: 'The bullet "Responsible for vendor management across 12 contracts" lists a duty.',
      impact: 8,
      actionId: "add_bullet_metric",
      actionArgs: { original: "Responsible for vendor management across 12 contracts" },
    },
    {
      severity: "Medium",
      category: "formatting",
      title: "Standardize date formats",
      description: "Mixed 'Jan 2019' and '2019-03' formats can confuse ATS parsers.",
      impact: 5,
      actionId: "standardize_resume_dates",
      actionArgs: {},
    },
    {
      severity: "critical",
      category: "content",
      title: "Rewrite the summary opener",
      description: 'Replace "Results-driven professional" with your scope.',
      impact: 7,
      actionId: "apply_resume_rewrite",
      actionArgs: {
        original: "Results-driven professional with 15 years of experience.",
        improved: "IT director with 15 years running infrastructure for 2,000-seat healthcare networks.",
        extra: "dropped",
      },
    },
    {
      severity: "low",
      category: "keywords",
      title: "Mention cloud migration",
      description: "The job stresses Azure; add it if true.",
      impact: 3,
      actionId: "extract_keywords",
      actionArgs: { text: "Azure" },
    },
    {
      severity: "nit",
      category: "structure",
      title: "Merge the two Acme entries",
      description: "Acme Corp appears twice for one continuous role.",
      impact: 4,
      actionId: "merge_work_entries",
      actionArgs: { first: "Acme Corp" },
    },
    {
      severity: "important",
      category: "made-up-bucket",
      title: "Tighten the long bullet",
      description: "One bullet runs three lines.",
      actionId: " shorten_bullet ",
      actionArgs: { original: "Led the end-to-end replacement of the legacy PBX phone system across nine regional clinics." },
    },
  ],
  optimizedContent: "Director of IT …",
};

describe("ResumeAnalysisIngest — real analyzer output (#374)", () => {
  const wire = ResumeAnalysisIngest.ingest.parse(MODEL_ANSWER);
  const out = ResumeAnalysisIngest.coerce(wire);

  it("produces a payload the canonical schema accepts", () => {
    assert.equal(ResumeAnalysisSchema.safeParse(out).success, true);
  });

  it("coerces drifted severity and category words onto the enums", () => {
    assert.deepEqual(
      out.recommendations.map((r) => [r.severity, r.category]),
      [
        ["critical", "impact"],
        ["important", "format"],
        ["critical", "content"],
        ["minor", "keywords"],
        ["minor", "structure"],
        ["important", "content"],
      ],
    );
  });

  it("keeps valid actions with their args, stripping unknown keys", () => {
    const [metric, dates, rewrite] = out.recommendations;
    assert.equal(metric.actionId, "add_bullet_metric");
    assert.deepEqual(metric.actionArgs, { original: "Responsible for vendor management across 12 contracts" });
    assert.equal(dates.actionId, "standardize_resume_dates");
    assert.deepEqual(dates.actionArgs, {});
    assert.equal(rewrite.actionId, "apply_resume_rewrite");
    assert.deepEqual(Object.keys(rewrite.actionArgs ?? {}).sort(), ["improved", "original"]);
  });

  it("trims a padded id", () => {
    assert.equal(out.recommendations[5].actionId, "shorten_bullet");
  });

  it("drops an invented wand id and args that don't fit the wand — but keeps the recommendation text", () => {
    const [, , , invented, partial] = out.recommendations;
    assert.equal(invented.actionId, undefined);
    assert.equal(invented.actionArgs, undefined);
    assert.equal(invented.title, "Mention cloud migration");
    assert.equal(partial.actionId, undefined, "merge needs both entries");
    assert.equal(partial.title, "Merge the two Acme entries");
  });

  it("an answer with no recommendations still validates", () => {
    const empty = ResumeAnalysisIngest.coerce(ResumeAnalysisIngest.ingest.parse({ ...MODEL_ANSWER, recommendations: [] }));
    assert.deepEqual(empty.recommendations, []);
  });

  it("rejects an answer with no scores (the chain moves to the next model)", () => {
    const { overallScore: _drop, ...noScore } = MODEL_ANSWER;
    void _drop;
    assert.equal(ResumeAnalysisIngest.ingest.safeParse(noScore).success, false);
  });
});

describe("coerceRecommendation — boundary cases", () => {
  it("a missing category falls back to content", () => {
    const r = coerceRecommendation({ severity: "important", category: "content", title: "t", description: "d" });
    assert.equal(r.category, "content");
    const wire = ResumeAnalysisIngest.ingest.parse({ ...MODEL_ANSWER, recommendations: [{ severity: "minor", title: "t", description: "d" }] });
    assert.equal(ResumeAnalysisIngest.coerce(wire).recommendations[0].category, "content");
  });

  it("an action id without args is checked against an empty args object", () => {
    assert.deepEqual(coerceRecommendation({ severity: "minor", category: "format", title: "t", description: "d", actionId: "standardize_resume_dates" }).actionId, "standardize_resume_dates");
    assert.equal(coerceRecommendation({ severity: "minor", category: "impact", title: "t", description: "d", actionId: "add_bullet_metric" }).actionId, undefined);
  });

  it("a quoted line too short to locate is not an action", () => {
    assert.equal(parseRecommendationAction("shorten_bullet", { original: "Led" }), null);
  });

  it("the fallback analysis validates against the canonical schema", () => {
    assert.equal(ResumeAnalysisSchema.safeParse(buildAnalysisFallback()).success, true);
  });
});

describe("WAND_ACTION_ARGS covers every wand id", () => {
  it("one args schema per id", () => {
    assert.deepEqual(Object.keys(WAND_ACTION_ARGS).sort(), [...WAND_ACTION_IDS].sort());
  });
});
