/**
 * Courses + Learning Paths API client.
 *
 * Thin wrapper around fetch — keeps every URL/path in one place so the
 * SCORM player, ScormPlayer-host page, course editor and learner UI all
 * agree on the same endpoints.
 */

import { standardAuthHeaders } from "../api-client";

const API = ((import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_URL ?? "/api").replace(/\/$/, "");

// Every backend route this client targets (`/courses`, `/learning-paths`,
// `/verify`) is mounted under `/api`. The paths below are written WITHOUT
// the `/api` prefix, so we must add it whenever the configured base origin
// doesn't already end in `/api`. In dev `VITE_API_URL` is unset → `API` is
// the relative `/api` (prefix present); in production it's the bare API
// origin (e.g. `https://api.hired.video`, prefix absent). Without this the
// prod URL collapses to `https://api.hired.video/courses/...` and 404s —
// the bug that left passed courses without an issued certificate. Mirrors
// the `/api` reconciliation the shared api-client already performs.
function apiUrl(path: string): string {
  const baseHasApi = /\/api$/i.test(API);
  return `${API}${baseHasApi ? "" : "/api"}${path}`;
}

async function call<T>(
  path: string,
  init: RequestInit & { auth?: string | null } = {},
): Promise<T> {
  const url = apiUrl(path);
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  // Attach the canonical auth headers (Bearer + active impersonation token) so
  // these calls authenticate like every other client. authMiddleware reads the
  // Authorization header ONLY — there is no cookie fallback — so relying on
  // `credentials: "include"` alone 401'd cross-origin (api.hired.video) prod.
  for (const [k, v] of Object.entries(standardAuthHeaders(url))) headers.set(k, v);
  // An explicit token (SCORM host page) still wins over the localStorage one.
  if (init.auth) headers.set("Authorization", `Bearer ${init.auth}`);
  const res = await fetch(url, { ...init, headers, credentials: "include" });
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

// ── Cohorts / classrooms + assignments (#1887/#1888/#1890) ─────────────

export interface Cohort {
  id: string;
  ownerUserId: string;
  ownerCompanyId: string | null;
  name: string;
  description: string | null;
  joinCode: string | null;
  status: "active" | "archived";
  createdAt: string;
  memberCount?: number;
}

export interface CohortMemberRow {
  member: {
    id: string;
    userId: string | null;
    invitedEmail: string | null;
    displayName: string | null;
    role: string;
    status: string;
  };
  userName?: string | null;
  userEmail?: string | null;
}

export interface AssignmentRow {
  id: string;
  cohortId: string;
  memberId: string | null;
  subjectType: "course" | "path";
  subjectId: string;
  required: boolean;
  dueAt: string | null;
  status: string;
}

export interface LearnerAssignment {
  assignmentId: string;
  cohortId: string;
  cohortName: string;
  subjectType: "course" | "path";
  subjectId: string;
  title: string;
  slug: string | null;
  required: boolean;
  dueAt: string | null;
  enrollmentId: string | null;
  passed: boolean;
}

export interface GradebookColumn {
  assignmentId: string;
  title: string;
  subjectType: "course" | "path";
  required: boolean;
  memberSpecific: boolean;
}

export interface CohortAnalytics {
  cohortId: string;
  generatedAt: string;
  memberCount: number;
  assignmentCount: number;
  assignments: GradebookColumn[];
  summary: { completed: number; inProgress: number; notStarted: number; overdue: number; completionRate: number };
  members: Array<{
    memberId: string;
    userId: string | null;
    name: string | null;
    email: string | null;
    role: string;
    status: string;
    linked: boolean;
    completedCount: number;
    totalCount: number;
    overdueCount: number;
    items: Array<{
      assignmentId: string;
      subjectType: "course" | "path";
      subjectId: string;
      title: string;
      required: boolean;
      dueAt: string | null;
      status: "not_started" | "in_progress" | "completed" | "not_linked";
      scorePct: number | null;
      fraction: number;
      completedAt: string | null;
      overdue: boolean;
    }>;
  }>;
}

// Educator
export const listManageableCohorts = () => call<Cohort[]>(`/cohorts/me`);
export const getCohort = (id: string) => call<{ cohort: Cohort; members: CohortMemberRow[] }>(`/cohorts/${id}`);
export const createCohort = (body: { name: string; description?: string; companyId?: string }) =>
  call<Cohort>(`/cohorts`, { method: "POST", body: JSON.stringify(body) });
export const updateCohort = (id: string, body: { name?: string; description?: string | null; rotateJoinCode?: boolean; status?: "active" | "archived" }) =>
  call<Cohort>(`/cohorts/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const addCohortMember = (id: string, body: { userId?: string; invitedEmail?: string; displayName?: string; role?: "student" | "co_educator" }) =>
  call(`/cohorts/${id}/members`, { method: "POST", body: JSON.stringify(body) });
export const removeCohortMember = (id: string, memberId: string) =>
  call(`/cohorts/${id}/members/${memberId}`, { method: "DELETE" });
export const listCohortAssignments = (id: string) => call<AssignmentRow[]>(`/cohorts/${id}/assignments`);
export const createAssignment = (id: string, body: { subjectType: "course" | "path"; subjectId: string; memberId?: string; required?: boolean; dueAt?: string }) =>
  call<AssignmentRow>(`/cohorts/${id}/assignments`, { method: "POST", body: JSON.stringify(body) });
export const removeAssignment = (id: string, assignmentId: string) =>
  call(`/cohorts/${id}/assignments/${assignmentId}`, { method: "DELETE" });
export const getCohortAnalytics = (id: string) => call<CohortAnalytics>(`/cohorts/${id}/analytics`);

// Learner
export const listMyAssignments = () => call<LearnerAssignment[]>(`/cohorts/assignments/me`);
export const listMyCohortMemberships = () =>
  call<Array<{ cohort: Cohort; member: { id: string; role: string } }>>(`/cohorts/memberships/me`);
export const joinCohortByCode = (joinCode: string) =>
  call<{ cohort: Cohort; member: unknown }>(`/cohorts/join`, { method: "POST", body: JSON.stringify({ joinCode }) });

/** The educator's own learning paths (for the assignment picker). */
export const listMyPaths = () =>
  call<Array<{ id: string; title: string; slug: string }>>(`/learning-paths/me`);

// ── Learner dashboard + XP leaderboard (#2068 GAP-4 + GAP-5) ─────────────

export interface LearnerCourseRow {
  enrollmentId: string;
  courseId: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  pct: number;
  passed: boolean;
}

export interface LearnerCertificateRow {
  id: string;
  certNumber: string;
  courseTitle: string | null;
  courseSlug: string | null;
  issuedAt: string;
}

export interface LearnerDashboard {
  stats: {
    activeCourses: number;
    completedCourses: number;
    certificates: number;
    points: number;
    streak: number;
    badges: number;
  };
  continueLearning: LearnerCourseRow[];
  completed: LearnerCourseRow[];
  certificates: LearnerCertificateRow[];
  assigned: LearnerAssignment[];
}

export const getLearnerDashboard = () => call<LearnerDashboard>(`/learning/dashboard`);

export interface XpLeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
}

export interface XpLeaderboard {
  scope: "global" | "cohort";
  entries: XpLeaderboardEntry[];
  viewer: { rank: number; points: number } | null;
}

export const getXpLeaderboard = (
  scope: "global" | "cohort" = "global",
  opts: { cohortId?: string; limit?: number } = {},
) => {
  const qs = new URLSearchParams({ scope });
  if (opts.cohortId) qs.set("cohortId", opts.cohortId);
  if (opts.limit) qs.set("limit", String(opts.limit));
  return call<XpLeaderboard>(`/learning/leaderboard?${qs.toString()}`);
};

/** #2068 GAP-3 — materialise a draft learning path from a goal. */
export const generateGoalPath = (goalId: string) =>
  call<{ path: { id: string; slug: string; title: string }; courseCount: number; generatedByLlm: boolean }>(
    `/learning-goals/${goalId}/generate-path`,
    { method: "POST", body: JSON.stringify({}) },
  );

// ── Tenant portability (#2281) — export/import learning content + records ─────

/** The three export artifacts, keyed by kind → { path, filename }. Single
 *  source so the download button, filename, and endpoint never drift apart. */
export const LEARNING_EXPORT_KINDS = {
  manifest: { path: "/learning/portability/export/manifest", filename: "learning-manifest.json" },
  results: { path: "/learning/portability/export/results.csv", filename: "learning-results.csv" },
  statements: { path: "/learning/portability/export/statements", filename: "learning-statements.json" },
} as const;

export type LearningExportKind = keyof typeof LEARNING_EXPORT_KINDS;

/** Fetch an export artifact as a Blob (these endpoints return RAW payloads, not
 *  the `{ data }` envelope, so `call()` can't be used). Auth headers are
 *  attached like every other client call. */
export async function fetchLearningExport(kind: LearningExportKind): Promise<{ blob: Blob; filename: string }> {
  const { path, filename } = LEARNING_EXPORT_KINDS[kind];
  const url = apiUrl(path);
  const headers = new Headers();
  for (const [k, v] of Object.entries(standardAuthHeaders(url))) headers.set(k, v);
  const res = await fetch(url, { headers, credentials: "include" });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return { blob: await res.blob(), filename };
}

export interface LrsCredentialView {
  id: string;
  label: string;
  keyId: string;
  permission: "read_write" | "read" | "write";
  active: boolean;
}

/** The owner's LRS credentials — the import target the statements land under. */
export const listLrsCredentials = () =>
  call<{ endpoint: string; credentials: LrsCredentialView[] }>("/learning/lrs-credentials");

/** Issue a new LRS credential. The plaintext `secret` is returned ONCE. */
export const createLrsCredential = (label: string, permission: "read_write" | "read" | "write" = "read_write") =>
  call<{ credential: LrsCredentialView; secret: string; basicAuth: string; endpoint: string }>(
    "/learning/lrs-credentials",
    { method: "POST", body: JSON.stringify({ label, permission }) },
  );

/** Bulk-import an xAPI statement array (or a full export envelope) into one of
 *  the owner's LRS credentials. */
export const importLearningStatements = (credentialId: string, statements: Record<string, unknown>[]) =>
  call<{ imported: number }>("/learning/portability/import/statements", {
    method: "POST",
    body: JSON.stringify({ credentialId, statements }),
  });
