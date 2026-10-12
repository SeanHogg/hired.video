/**
 * Frontend client for live-screening — back-to-back live screener sessions
 * (#1239). API lives at /api/recruiter/live-screen/* (recruiter) and
 * /api/live-screen/* (candidate, token-only).
 *
 * Schema lives in `live_screening_sessions` + `live_screening_invites`
 * (migration 0118). The recruiter declares a window and slot length; the
 * scheduler partitions the window into back-to-back slots and emits one
 * invite per candidate. Candidates accept/decline through a public token
 * URL — no auth, mirroring the async-interview magic-link UX.
 */

import { apiClient } from "../api-client";

export type LiveScreenStatus = "draft" | "scheduled" | "running" | "completed" | "cancelled";
export type LiveScreenInviteStatus = "pending" | "accepted" | "declined" | "no_show" | "completed";

export interface LiveScreenSession {
  id: string;
  recruiterId: string;
  jobId: string | null;
  title: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  meetingUrl: string | null;
  criteria: Record<string, unknown>;
  status: LiveScreenStatus;
  createdAt: string;
  updatedAt: string;
  /** Total slots the window can hold given start/end/slotMinutes. Returned
   *  by POST /sessions; recomputed locally by `windowCapacity` elsewhere. */
  capacity?: number;
}

export interface LiveScreenInvite {
  id: string;
  sessionId: string;
  candidateId: string | null;
  candidateName: string;
  candidateEmail: string | null;
  slotStart: string;
  slotEnd: string;
  inviteToken: string;
  status: LiveScreenInviteStatus;
  respondedAt: string | null;
  responseNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionPayload {
  title: string;
  jobId?: string | null;
  startTime: string;
  endTime: string;
  slotMinutes?: number;
  meetingUrl?: string | null;
  criteria?: Record<string, unknown>;
}

export interface SchedulePayload {
  candidates: Array<{
    candidateId: string | null;
    candidateName: string;
    candidateEmail?: string | null;
  }>;
}

export interface ScheduleResult {
  capacity: number;
  scheduled: number;
  unscheduled: Array<{ candidateName: string }>;
  invites: LiveScreenInvite[];
}

export async function listLiveScreenSessions(): Promise<LiveScreenSession[]> {
  const res = await apiClient.get<LiveScreenSession[]>("/api/recruiter/live-screen/sessions");
  return res.data;
}

export async function getLiveScreenSession(
  id: string,
): Promise<{ session: LiveScreenSession; invites: LiveScreenInvite[] }> {
  const res = await apiClient.get<{ session: LiveScreenSession; invites: LiveScreenInvite[] }>(
    `/api/recruiter/live-screen/sessions/${id}`,
  );
  return res.data;
}

export async function createLiveScreenSession(
  payload: CreateSessionPayload,
): Promise<LiveScreenSession> {
  const res = await apiClient.post<LiveScreenSession>(
    "/api/recruiter/live-screen/sessions",
    payload,
  );
  return res.data;
}

export async function scheduleLiveScreenSession(
  id: string,
  payload: SchedulePayload,
): Promise<ScheduleResult> {
  const res = await apiClient.post<ScheduleResult>(
    `/api/recruiter/live-screen/sessions/${id}/schedule`,
    payload,
  );
  return res.data;
}

export interface AutoMatchResult extends ScheduleResult {
  sourceRunId: string;
}

/** ZipIntro parity #1208: pull top scored candidates from the latest
 *  agent run for this session's job (or an explicit runId) and run
 *  them through the back-to-back scheduler. One-button intent. */
export async function autoMatchLiveScreenSession(
  id: string,
  input?: { runId?: string; limit?: number },
): Promise<AutoMatchResult> {
  const res = await apiClient.post<AutoMatchResult>(
    `/api/recruiter/live-screen/sessions/${id}/auto-match`,
    input ?? {},
  );
  return res.data;
}

// ─── Candidate magic-link (public, token-only) ─────────────────────────────

export interface LiveScreenInvitePreview {
  invite: {
    id: string;
    candidateName: string;
    slotStart: string;
    slotEnd: string;
    status: LiveScreenInviteStatus;
    respondedAt: string | null;
  };
  session: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    slotMinutes: number;
    meetingUrl: string | null;
    status: LiveScreenStatus;
  } | null;
}

export async function getLiveScreenInvite(token: string): Promise<LiveScreenInvitePreview> {
  const res = await apiClient.get<LiveScreenInvitePreview>(`/api/live-screen/invites/${token}`);
  return res.data;
}

export async function respondLiveScreenInvite(
  token: string,
  action: "accept" | "decline",
  notes?: string,
): Promise<LiveScreenInvite> {
  const res = await apiClient.post<LiveScreenInvite>(
    `/api/live-screen/invites/${token}/respond`,
    { action, notes },
  );
  return res.data;
}
