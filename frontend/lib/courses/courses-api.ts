/**
 * Courses + Learning Paths API client.
 *
 * Thin wrapper around apiClient — keeps every URL/path in one place so the
 * SCORM player, ScormPlayer-host page, course editor and learner UI all
 * agree on the same endpoints.
 */

import { apiClient, type RequestConfig } from "../api-client";
import { fetchApiBlob } from "../services/download-service";

// Every backend route this client targets (`/courses`, `/learning`,
// `/verify`, …) is mounted under `/api`; the paths below are
// written WITHOUT that prefix and `call()` adds it. The transport (base URL,
// Bearer + X-Emulation-Token, logging, typed errors) is the shared apiClient.
async function call<T>(
  path: string,
  init: { method?: RequestConfig["method"]; body?: unknown } = {},
): Promise<T> {
  // requestRaw (not fetchData): a few of these routes answer with a bare
  // `{ data }` body. Callers own their error UX, so no global toast.
  const res = await apiClient.requestRaw<{ data?: T }>(`/api${path}`, {
    method: init.method,
    body: init.body,
    suppressErrorEvent: true,
  });
  return (res.data?.data ?? null) as T;
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

export function commitScormState(enrollmentId: string, input: ScormCommitInput) {
  return call(`/courses/scorm/${enrollmentId}/commit`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loadScormState(enrollmentId: string, lessonId: string) {
  return call<{
    cmi: Record<string, unknown>;
    suspendData: string | null;
    completionStatus: string | null;
    scoreRaw: number | null;
    totalTimeSec: number;
  } | null>(`/courses/scorm/${enrollmentId}/${lessonId}`);
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

export function emitXapi(input: XapiStatementInput) {
  return call(`/learning/xapi/statements`, {
    method: "POST",
    body: JSON.stringify(input),
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
) {
  return call(`/courses/enrollments/${enrollmentId}/progress`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function issueCertificate(enrollmentId: string) {
  return call(`/courses/enrollments/${enrollmentId}/certificate`, {
    method: "POST",
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

export function getPathProgress(pathId: string) {
  return call<{
    unlocked: string[];
    passed: string[];
    locked: Array<{ courseId: string; missing: string[] }>;
    complete: boolean;
  }>(`/learning/paths/${pathId}/progress`);
}

export function enrollInPath(pathId: string) {
  return call(`/learning/paths/${pathId}/enroll`, { method: "POST" });
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
export const listManageableCohorts = () => call<Cohort[]>(`/learning/cohorts/me`);
export const getCohort = (id: string) => call<{ cohort: Cohort; members: CohortMemberRow[] }>(`/learning/cohorts/${id}`);
export const createCohort = (body: { name: string; description?: string; companyId?: string }) =>
  call<Cohort>(`/learning/cohorts`, { method: "POST", body: JSON.stringify(body) });
export const updateCohort = (id: string, body: { name?: string; description?: string | null; rotateJoinCode?: boolean; status?: "active" | "archived" }) =>
  call<Cohort>(`/learning/cohorts/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const addCohortMember = (id: string, body: { userId?: string; invitedEmail?: string; displayName?: string; role?: "student" | "co_educator" }) =>
  call(`/learning/cohorts/${id}/members`, { method: "POST", body: JSON.stringify(body) });
export const removeCohortMember = (id: string, memberId: string) =>
  call(`/learning/cohorts/${id}/members/${memberId}`, { method: "DELETE" });
export const listCohortAssignments = (id: string) => call<AssignmentRow[]>(`/learning/cohorts/${id}/assignments`);
export const createAssignment = (id: string, body: { subjectType: "course" | "path"; subjectId: string; memberId?: string; required?: boolean; dueAt?: string }) =>
  call<AssignmentRow>(`/learning/cohorts/${id}/assignments`, { method: "POST", body: JSON.stringify(body) });
export const removeAssignment = (id: string, assignmentId: string) =>
  call(`/learning/cohorts/${id}/assignments/${assignmentId}`, { method: "DELETE" });
export const getCohortAnalytics = (id: string) => call<CohortAnalytics>(`/learning/cohorts/${id}/analytics`);

// Learner
export const listMyAssignments = () => call<LearnerAssignment[]>(`/learning/cohorts/assignments/me`);
export const listMyCohortMemberships = () =>
  call<Array<{ cohort: Cohort; member: { id: string; role: string } }>>(`/learning/cohorts/memberships/me`);
export const joinCohortByCode = (joinCode: string) =>
  call<{ cohort: Cohort; member: unknown }>(`/learning/cohorts/join`, { method: "POST", body: JSON.stringify({ joinCode }) });

/** The educator's own learning paths (for the assignment picker). */
export const listMyPaths = () =>
  call<Array<{ id: string; title: string; slug: string }>>(`/learning/paths/me`);

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
    `/learning/goals/${goalId}/generate-path`,
    { method: "POST", body: JSON.stringify({}) },
  );

// ── Tenant portability (#2281) — export/import learning content + records ─────

/** The three export artifacts, keyed by kind → { path, filename }. Single
 *  source so the download button, filename, and endpoint never drift apart. */
export const LEARNING_EXPORT_KINDS = {
  manifest: { path: "/learning/xapi/portability/export/manifest", filename: "learning-manifest.json" },
  results: { path: "/learning/xapi/portability/export/results.csv", filename: "learning-results.csv" },
  statements: { path: "/learning/xapi/portability/export/statements", filename: "learning-statements.json" },
} as const;

export type LearningExportKind = keyof typeof LEARNING_EXPORT_KINDS;

/** Fetch an export artifact as a Blob (these endpoints return RAW payloads, not
 *  the `{ data }` envelope, so `call()` can't be used). */
export async function fetchLearningExport(kind: LearningExportKind): Promise<{ blob: Blob; filename: string }> {
  const { path, filename } = LEARNING_EXPORT_KINDS[kind];
  return { blob: await fetchApiBlob(`/api${path}`), filename };
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
  call<{ endpoint: string; credentials: LrsCredentialView[] }>("/learning/xapi/credentials");

/** Issue a new LRS credential. The plaintext `secret` is returned ONCE. */
export const createLrsCredential = (label: string, permission: "read_write" | "read" | "write" = "read_write") =>
  call<{ credential: LrsCredentialView; secret: string; basicAuth: string; endpoint: string }>(
    "/learning/xapi/credentials",
    { method: "POST", body: JSON.stringify({ label, permission }) },
  );

/** Bulk-import an xAPI statement array (or a full export envelope) into one of
 *  the owner's LRS credentials. */
export const importLearningStatements = (credentialId: string, statements: Record<string, unknown>[]) =>
  call<{ imported: number }>("/learning/xapi/portability/import/statements", {
    method: "POST",
    body: JSON.stringify({ credentialId, statements }),
  });
