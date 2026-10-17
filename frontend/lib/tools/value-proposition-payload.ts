// Pure payload builders for the Value Proposition wizard.
//
// The wizard collects three pieces of input — Job, Resume, Company — each
// with multiple input modes (existing record vs. text vs. uploaded file).
// Two payloads are then produced:
//
//   1. The value-proposition AI tool request (POST /api/ai/tools/value-proposition) (`buildGenerateInput`)
//   2. The /api/tool-runs record-run args (`buildRecordRunArgs`)
//
// These are factored out of `pages/tools/ValueProposition.tsx` so the
// nine input-mode combinations can be unit-tested without rendering the
// React tree. The page just calls these and forwards the results.

import type { ValuePropositionRequest, ValuePropositionResponse } from "@/lib/services/value-proposition-service";
import type { RecordToolRunArgs } from "@/lib/tools/use-tool-run-recorder";

export type JobSource = "url" | "paste" | "file" | "existing";
export type ResumeSource = "existing" | "paste" | "file";

export interface JobData {
  jobId?: string;
  jobContent?: string;
  source: JobSource;
}

export interface ResumeData {
  resumeId?: string;
  resumeContent?: string;
  source: ResumeSource;
}

export interface CompanyData {
  name?: string;
  mission?: string;
  values?: string;
}

/** Build the request body for valuePropositionService.generate(). */
export function buildGenerateInput(
  jobData: JobData,
  resumeData: ResumeData,
  companyData: CompanyData,
): ValuePropositionRequest {
  return {
    jobId: jobData.source === "existing" ? jobData.jobId : undefined,
    jobContent: jobData.source !== "existing" ? jobData.jobContent : undefined,
    resumeId: resumeData.source === "existing" ? resumeData.resumeId : undefined,
    resumeContent: resumeData.source !== "existing" ? resumeData.resumeContent : undefined,
    companyName: companyData.name,
    companyMission: companyData.mission,
    companyValues: companyData.values,
  };
}

/** confidenceScore is 0..1 in the schema — scale to 0..100 so it sits
 *  alongside the other tools' percentage-style scores in history. Returns
 *  null when the response had no numeric score. */
export function scaleConfidenceScore(result: Pick<ValuePropositionResponse, "confidenceScore">): number | null {
  return typeof result.confidenceScore === "number"
    ? Math.round(result.confidenceScore * 100)
    : null;
}

/** Build the args for useToolRunRecorder().recordRun(). The job/resume id
 *  fields are only set when the user picked an existing record — pasted
 *  / uploaded inputs go into `jobDescription` (job) or are discarded
 *  (resume content lives in the result blob already).
 *
 *  The API response is mapped into the shared `NormalizedToolRunResult`
 *  shape so the history sheet's Copy Report and inline view render the
 *  generated value proposition correctly: `executiveSummary` becomes
 *  `summary`, `keyStrengths` become `strengths`, `alignmentPoints` and
 *  `callToAction` are surfaced as recommendations. The full payload is
 *  stashed on `raw` for any future viewer that wants the original. */
export function buildRecordRunArgs(
  jobData: JobData,
  resumeData: ResumeData,
  result: ValuePropositionResponse,
): RecordToolRunArgs {
  const scaledScore = scaleConfidenceScore(result);
  return {
    score: scaledScore,
    result: {
      overallScore: scaledScore ?? undefined,
      summary: result.executiveSummary,
      strengths: result.keyStrengths,
      recommendations: [
        { title: "Value Proposition", description: result.valueProposition },
        ...result.alignmentPoints.map((point) => ({ title: "Alignment", description: point })),
        { title: "Call to Action", description: result.callToAction },
      ],
      raw: result,
    },
    summary: scaledScore != null
      ? `Value proposition (confidence ${scaledScore}%)`
      : "Value proposition generated",
    resumeId: resumeData.source === "existing" ? resumeData.resumeId : undefined,
    jobId: jobData.source === "existing" ? jobData.jobId : undefined,
    jobDescription: jobData.source !== "existing" ? jobData.jobContent : undefined,
  };
}
