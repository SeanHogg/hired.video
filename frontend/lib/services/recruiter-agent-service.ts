/**
 * AI Recruiter Agent v2 client. Wraps /api/recruiter/agent/* — the
 * intake → source → schedule-followups loop that closes the LinkedIn
 * Hiring Assistant parity gap (gaps #1207, #1206).
 */

import { apiClient } from "../api-client";

export interface AgentCriteria {
  jobTitle: string;
  skills: string[];
  location: string;
  experienceYears: number | null;
  maxCandidates: number;
  source?: "brief" | "job" | "fallback";
}

export interface AgentRunResult {
  candidateId: string;
  name: string;
  email?: string;
  score: number;
  scoreReason: string;
  outreachDraft: string;
}

export interface AgentRun {
  id: string;
  recruiterId: string;
  jobId: string | null;
  jobTitle: string;
  criteria: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  candidatesFound: number;
  candidatesScored: number;
  results: AgentRunResult[];
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface AgentFollowup {
  id: string;
  runId: string;
  recruiterId: string;
  candidateId: string;
  followupKind: string;
  sequenceIndex: number;
  scheduledFor: string;
  sentAt: string | null;
  body: string;
  status: "pending" | "sent" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export const recruiterAgentService = {
  async intake(input: { briefText?: string; jobId?: string }): Promise<AgentCriteria> {
    const res = await apiClient.post<AgentCriteria>("/api/recruiter/agent/intake", input);
    return res.data;
  },

  async source(input: {
    jobTitle: string;
    skills: string[];
    location?: string;
    experienceYears?: number | null;
    maxCandidates?: number;
    jobId?: string | null;
  }): Promise<{ runId: string; jobTitle: string; candidatesFound: number; results: AgentRunResult[] }> {
    const res = await apiClient.post<{ runId: string; jobTitle: string; candidatesFound: number; results: AgentRunResult[] }>(
      "/api/recruiter/agent/source",
      input,
    );
    return res.data;
  },

  async listRuns(): Promise<AgentRun[]> {
    const res = await apiClient.get<AgentRun[]>("/api/recruiter/agent/runs", null as any);
    return res.data;
  },

  async getRun(id: string): Promise<AgentRun> {
    const res = await apiClient.get<AgentRun>(`/api/recruiter/agent/runs/${id}`, null as any);
    return res.data;
  },

  async listFollowups(status?: "pending" | "sent" | "cancelled"): Promise<AgentFollowup[]> {
    const qs = status ? `?status=${status}` : "";
    const res = await apiClient.get<AgentFollowup[]>(`/api/recruiter/agent/followups${qs}`, null as any);
    return res.data;
  },

  async scheduleFollowup(input: {
    runId: string;
    candidateId: string;
    body: string;
    dayOffset?: number;
    sequenceIndex?: number;
    followupKind?: string;
  }): Promise<AgentFollowup> {
    const res = await apiClient.post<AgentFollowup>("/api/recruiter/agent/followups/schedule", input);
    return res.data;
  },

  async cancelFollowup(id: string): Promise<AgentFollowup> {
    const res = await apiClient.post<AgentFollowup>(`/api/recruiter/agent/followups/${id}/cancel`, {});
    return res.data;
  },
};
