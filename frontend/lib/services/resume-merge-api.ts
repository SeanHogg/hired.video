/**
 * Résumé merge client — `/api/resumes/merge/*` (analyze / preview / execute /
 * from-file). Exposed on `resumeService` (resume-service.ts) under the same
 * method names; split out to keep that module small.
 */
import { z } from "zod";
import { apiClient } from "../api-client";
import type {
  MergeRequest,
  MergePreviewRequest,
  MergeResult,
  FileMergeAnalysis,
  MergePreview,
  ResumeToResumeAnalysis,
} from "@/types/resume";
import { resolveResumeUploadPayload, resumeFilesFormData } from "./resume-upload-payload";

/** The résumé a merge goes into: a stored id, or content sent inline. */
export type MergeTarget = string | { content: Record<string, unknown> };

function mergeTargetBody(target: MergeTarget) {
  return typeof target === "string" ? { targetResumeId: target } : { targetContent: target.content };
}

/** `target` is a stored résumé id, or `{ content }` — what is on screen
 *  (the kit pulls the master into a version it has open). */
export async function analyzeMerge(sourceResumeId: string, target: MergeTarget, useAI = true): Promise<ResumeToResumeAnalysis> {
  // AI-backed analyze can exceed the 30s default on large resumes.
  const response = await apiClient.request<ResumeToResumeAnalysis>(
    `/api/resumes/merge/analyze`,
    { method: "POST", body: { sourceResumeId, ...mergeTargetBody(target), useAI }, timeout: 120_000 },
    z.any(),
  );
  return response.data;
}

export async function executeMerge(request: MergeRequest): Promise<MergeResult> {
  const response = await apiClient.post<MergeResult>(`/api/resumes/merge/execute`, request, z.any());
  return response.data;
}

/**
 * Run the merge without saving — returns the merged content so the UI
 * can render a preview before the user commits. Same inputs as
 * executeMerge minus the save-only fields.
 */
export async function previewMerge(request: MergePreviewRequest): Promise<MergePreview> {
  const response = await apiClient.post<MergePreview>(`/api/resumes/merge/preview`, request, z.any());
  return response.data;
}

/** Analyse content that is already parsed (no AI parse step) against a
 *  target — the kit workspace re-runs a merge it reviewed against the master. */
export async function analyzeParsedMerge(
  parsedContent: Record<string, unknown>,
  target: MergeTarget,
  useAI = true,
): Promise<FileMergeAnalysis> {
  const response = await apiClient.request<FileMergeAnalysis>(
    `/api/resumes/merge/from-file`,
    { method: "POST", body: { parsedContent, ...mergeTargetBody(target), useAI }, timeout: 120_000 },
    z.any(),
  );
  return response.data;
}

export async function analyzeFileMerge(file: File, target: MergeTarget, useAI = true): Promise<FileMergeAnalysis> {
  // Same transport decision as parse: a JSON Resume export goes over as
  // structured `parsedContent` (dates/highlights exact, no AI roundtrip);
  // usable client-extracted text goes as `text`; images, scans and files the
  // browser can't read (pdfjs often fails on phones) upload raw as multipart
  // so the server runs its extractor / vision OCR (#2228).
  const payload = await resolveResumeUploadPayload(file);
  let body: FormData | Record<string, unknown>;
  if (payload.kind === "files") {
    const fd = resumeFilesFormData(payload.files);
    if (typeof target === "string") fd.append("targetResumeId", target);
    else fd.append("targetContent", JSON.stringify(target.content));
    fd.append("useAI", String(useAI));
    body = fd;
  } else {
    const source = payload.kind === "structured" ? { parsedContent: payload.content } : { text: payload.text };
    body = { ...source, ...mergeTargetBody(target), useAI };
  }

  // Back-to-back AI calls (extract/OCR + parse + analyze) on a multi-page
  // resume can comfortably exceed the 30s default. Bump to 120s so the
  // client doesn't abort a request the backend is still working on.
  const response = await apiClient.request<FileMergeAnalysis>(
    `/api/resumes/merge/from-file`,
    { method: "POST", body, timeout: 120_000 },
    z.any(),
  );
  return response.data;
}
