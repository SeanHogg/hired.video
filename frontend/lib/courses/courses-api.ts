/**
 * Courses + Learning Paths API client.
 *
 * Thin wrapper around fetch — keeps every URL/path in one place so the
 * SCORM player, ScormPlayer-host page, course editor and learner UI all
 * agree on the same endpoints.
 */

const API = ((import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_URL ?? "/api").replace(/\/$/, "");

async function call<T>(
  path: string,
  init: RequestInit & { auth?: string | null } = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (init.auth) headers.set("Authorization", `Bearer ${init.auth}`);
  const res = await fetch(`${API}${path}`, { ...init, headers, credentials: "include" });
  const json = await res.json().catch(() => ({})) as { data?: T; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Request failed: ${res.status}`);
  return (json.data ?? null) as T;
}

// ── SCORM CMI persistence ────────────────────────────────────────────

export interface ScormCommitInput {
  lessonId: string;
  scormVersion: "1.2" | "2004_1" | "2004_2" | "2004_3" | "2004_4";
  cmi: Record<string, unknown>;
  completionStatus?: "not_attempted" | "incomplete" | "completed" | "passed" | "failed";
  scoreRaw?: number;
  scoreMin?: number;
  scoreMax?: number;
  totalTimeSec?: number;
  suspendData?: string;
}

export function commitScormState(enrollmentId: string, input: ScormCommitInput, auth?: string | null) {
  return call(`/courses/scorm/${enrollmentId}/commit`, {
    method: "POST",
    body: JSON.stringify(input),
    auth,
  });
}

export function loadScormState(enrollmentId: string, lessonId: string, auth?: string | null) {
  return call<{
    cmi: Record<string, unknown>;
    suspendData: string | null;
    completionStatus: string | null;
    scoreRaw: number | null;
    totalTimeSec: number;
  } | null>(`/courses/scorm/${enrollmentId}/${lessonId}`, { auth });
}

// ── xAPI emit ────────────────────────────────────────────────────────

export interface XapiStatementInput {
  enrollmentId?: string;
  lessonId?: string;
  courseId?: string;
  verb: { id: string; display?: string };
  object: { id: string; objectType?: string };
  result?: {
    score?: { scaled?: number; raw?: number };
    success?: boolean;
    completion?: boolean;
    duration?: string;
  };
  context?: Record<string, unknown>;
  timestamp?: string;
}

export function emitXapi(input: XapiStatementInput, auth?: string | null) {
  return call(`/courses/xapi/statements`, {
    method: "POST",
    body: JSON.stringify(input),
    auth,
  });
}

// ── Progress / completion ────────────────────────────────────────────

export function patchLessonProgress(
  enrollmentId: string,
  body: {
    lessonId: string;
    status: "not_started" | "in_progress" | "passed" | "failed";
    scoreRaw?: number;
    scoreMax?: number;
    timeSpentSec?: number;
  },
  auth?: string | null,
) {
  return call(`/courses/enrollments/${enrollmentId}/progress`, {
    method: "PATCH",
    body: JSON.stringify(body),
    auth,
  });
}

export function issueCertificate(enrollmentId: string, auth?: string | null) {
  return call(`/courses/enrollments/${enrollmentId}/certificate`, {
    method: "POST",
    auth,
  });
}

// ── Public verify ────────────────────────────────────────────────────

export interface VerifyResult {
  valid: boolean;
  reason?: "not_found" | "tampered" | "revoked" | "expired";
  certNumber?: string;
  issuedAt?: string;
  expiresAt?: string | null;
  courseTitle?: string;
  recipientName?: string;
  finalScorePct?: number | null;
  issuer?: string;
}

export function verifyCertificate(certNumber: string) {
  return call<VerifyResult>(`/verify/${encodeURIComponent(certNumber)}`);
}

// ── Learning paths ───────────────────────────────────────────────────

export function getPathProgress(pathId: string, auth?: string | null) {
  return call<{
    unlocked: string[];
    passed: string[];
    locked: Array<{ courseId: string; missing: string[] }>;
    complete: boolean;
  }>(`/learning-paths/${pathId}/progress`, { auth });
}

export function enrollInPath(pathId: string, auth?: string | null) {
  return call(`/learning-paths/${pathId}/enroll`, { method: "POST", auth });
}
