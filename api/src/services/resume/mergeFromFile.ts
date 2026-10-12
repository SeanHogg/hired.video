/**
 * Merge-from-file use case — an uploaded résumé analysed as a merge source
 * against a target résumé (POST /api/resumes/merge/from-file, #2390).
 *
 * The route only reads the request (JSON or multipart), applies the shared
 * OCR gate (routes/resume-upload-ocr-gate.ts) and shapes the response; this
 * module owns the orchestration:
 *
 *   1. resolve the target first — a bad id fails before any extraction spend;
 *   2. turn the source into JSON Resume content, in order of fidelity:
 *      pre-parsed JSON from the client, a JSON Resume (uploaded file or
 *      pasted text), then AI parsing of extracted / OCR'd text — through the
 *      SAME upload intake + binary guard as /parse and /createfromfile;
 *   3. run the merge analysis (AI-refined when an LLM client is supplied).
 *
 * Pure of HTTP and of the database: the repository, OCR, AI-parse and LLM
 * ports are injected (production wiring: `buildMergeFromFileDeps` in deps.ts).
 */
import type { IResumeRepository } from "../../repositories/index.js";
import type { LLMClient } from "../adapters/llm-client.js";
import { analyzeMerge, type MergeAnalysis } from "./merge.js";
import { resolveMergeSide } from "./merge-flow.js";
import { normalizeJsonResume } from "./parse.js";
import { RESUME_BINARY_TEXT_MESSAGE, classifyResumeText, extractUploadedResumeFiles } from "./uploadIntake.js";

type Content = Record<string, unknown>;

export type MergeSourceInput =
  | { kind: "parsed"; content: Content }
  | { kind: "text"; text: string }
  | { kind: "files"; files: File[] };

export interface MergeFromFileInput {
  source: MergeSourceInput;
  targetResumeId?: string;
  targetContent?: Content;
  useAI: boolean;
}

export interface MergeFromFileDeps {
  resumes: Pick<IResumeRepository, "findByIdForOwner">;
  /** Vision OCR for an image upload (the route's `ocrResumeImage`). */
  ocrImage: (file: File) => Promise<string>;
  /** Résumé text → JSON Resume content (the shared AI parse pipeline). */
  parseText: (text: string) => Promise<Content>;
  /** Null when no provider is configured; analysis then runs rule-based only. */
  llm: LLMClient | null;
}

export interface MergeFromFileResult {
  parsedContent: Content;
  targetContent: Content;
  analysis: MergeAnalysis;
  parseConfidence: number;
}

export type MergeFromFileOutcome =
  | { result: MergeFromFileResult }
  | { error: { code: "NOT_FOUND" | "PARSE_FAILED"; message: string } };

type ParsedSource = { parsedContent: Content; parseConfidence: number } | { message: string };

export const MERGE_FROM_FILE_FEATURE_KEY = "resume_merge_analyze_from_file";

export async function analyzeMergeFromFile(
  ownerId: string,
  input: MergeFromFileInput,
  deps: MergeFromFileDeps,
): Promise<MergeFromFileOutcome> {
  const target = await resolveMergeSide(deps.resumes, ownerId, "Target", {
    resumeId: input.targetResumeId,
    content: input.targetContent,
  });
  if (!("content" in target)) return { error: { code: "NOT_FOUND", message: "Target resume not found" } };

  const source = await parseMergeSource(input.source, deps);
  if ("message" in source) return { error: { code: "PARSE_FAILED", message: source.message } };

  const analysis = await analyzeMerge(
    source.parsedContent,
    target.content,
    input.useAI ? deps.llm : null,
    MERGE_FROM_FILE_FEATURE_KEY,
  );
  return {
    result: {
      parsedContent: source.parsedContent,
      targetContent: target.content,
      analysis,
      parseConfidence: source.parseConfidence,
    },
  };
}

async function parseMergeSource(source: MergeSourceInput, deps: MergeFromFileDeps): Promise<ParsedSource> {
  if (source.kind === "parsed") return { parsedContent: normalizeJsonResume(source.content), parseConfidence: 1.0 };

  let text: string;
  if (source.kind === "files") {
    const intake = await extractUploadedResumeFiles(source.files, { ocrImage: deps.ocrImage });
    if (intake.kind === "error") return { message: intake.message };
    if (intake.kind === "structured") return { parsedContent: intake.content, parseConfidence: 1.0 };
    text = intake.text;
  } else {
    text = source.text;
  }

  const classified = classifyResumeText(text);
  if (classified.kind === "binary") return { message: RESUME_BINARY_TEXT_MESSAGE };
  if (classified.kind === "structured") return { parsedContent: classified.content, parseConfidence: 1.0 };

  const parsedContent = await deps.parseText(classified.text);
  return { parsedContent, parseConfidence: Object.keys(parsedContent).length > 2 ? 0.8 : 0.4 };
}
