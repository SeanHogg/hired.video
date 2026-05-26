// Calibration sessions service — client for /api/calibration (#1381).

import { apiClient } from "../api-client";
import type { Recommendation } from "./scorecards-service";

export type CalibrationStatus = "open" | "closed" | "archived";

export interface CalibrationSession {
  id: string;
  companyId: string;
  organizerId: string;
  templateId: string;
  name: string;
  description: string | null;
  status: CalibrationStatus;
  candidateApplicationIds: string[];
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalibrationSubmission {
  id: string;
  sessionId: string;
  evaluatorUserId: string;
  applicationId: string;
  overallRecommendation: Recommendation | null;
  overallScore: number | null;
  ratings: Record<string, number | null>;
  notes: string | null;
  submittedAt: string;
}

export interface AttributeDelta {
  attributeId: string;
  calibrationMean: number | null;
  realMean: number | null;
  delta: number | null;
  calibrationSamples: number;
  realSamples: number;
}

export interface CalibrationSessionView {
  session: CalibrationSession;
  submissions: CalibrationSubmission[];
  deltas: Record<string, AttributeDelta[]> | null;
}

export const calibrationService = {
  async listSessions(): Promise<CalibrationSession[]> {
    return (await apiClient.get<CalibrationSession[]>("/api/calibration/sessions"))
      .data ?? [];
  },
  async getSession(id: string): Promise<CalibrationSessionView | null> {
    return (
      await apiClient.get<CalibrationSessionView>(`/api/calibration/sessions/${id}`)
    ).data ?? null;
  },
  async createSession(input: {
    companyId: string;
    templateId: string;
    name: string;
    description?: string;
    candidateApplicationIds: string[];
  }): Promise<CalibrationSession> {
    return (
      await apiClient.post<CalibrationSession>("/api/calibration/sessions", input)
    ).data!;
  },
  async submitCalibration(
    sessionId: string,
    input: {
      applicationId: string;
      ratings: Record<string, number | null>;
      overallRecommendation?: Recommendation;
      overallScore?: number | null;
      notes?: string;
    },
  ): Promise<CalibrationSubmission> {
    return (
      await apiClient.post<CalibrationSubmission>(
        `/api/calibration/sessions/${sessionId}/submissions`,
        input,
      )
    ).data!;
  },
  async closeSession(id: string): Promise<CalibrationSession> {
    return (
      await apiClient.post<CalibrationSession>(
        `/api/calibration/sessions/${id}/close`,
        {},
      )
    ).data!;
  },
};
