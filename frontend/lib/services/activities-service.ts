/**
 * Activities service — frontend wrapper for /api/activities/* (migration 0492).
 *
 * The employer's Team page + the shared AssignActivityDialog, plus the worker's
 * MyActivities panel, all consume this. Single SSoT for the API shape; no other
 * surface should hit /api/activities/* directly.
 */

import { apiClient } from "@/lib/api-client";
import type {
  ActivityDTO,
  AssignActivityInput,
  AssignableWorkerDTO,
} from "@shared/activities";

export type { ActivityDTO, AssignActivityInput, AssignableWorkerDTO } from "@shared/activities";

export interface ActivityTimeEntry {
  id: string;
  taskId: string | null;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  status: string;
}

async function unwrap<T>(p: Promise<{ data: T }>): Promise<T> {
  const r = await p;
  return r.data;
}

class ActivitiesService {
  // Employer
  assign(input: AssignActivityInput) {
    return unwrap(apiClient.post<ActivityDTO>("/api/activities", input));
  }
  listCompanyActivities() {
    return unwrap(apiClient.get<{ activities: ActivityDTO[] }>("/api/activities/company"));
  }
  listAssignableWorkers() {
    return unwrap(apiClient.get<{ workers: AssignableWorkerDTO[] }>("/api/activities/assignable-workers"));
  }
  approve(id: string) {
    return unwrap(apiClient.post<ActivityDTO>(`/api/activities/${id}/approve`, {}));
  }
  reject(id: string, reason: string) {
    return unwrap(apiClient.post<ActivityDTO>(`/api/activities/${id}/reject`, { reason }));
  }

  // Worker
  listAssignedToMe() {
    return unwrap(apiClient.get<{ activities: ActivityDTO[] }>("/api/activities/assigned"));
  }
  getActiveTimer() {
    return unwrap(apiClient.get<ActivityTimeEntry | null>("/api/activities/timer/active"));
  }
  startTimer(id: string) {
    return unwrap(apiClient.post<ActivityTimeEntry>(`/api/activities/${id}/timer/start`, {}));
  }
  stopTimer(id: string) {
    return unwrap(apiClient.post<ActivityTimeEntry | null>(`/api/activities/${id}/timer/stop`, {}));
  }
  submit(id: string) {
    return unwrap(apiClient.post<ActivityDTO>(`/api/activities/${id}/submit`, {}));
  }
}

export const activitiesService = new ActivitiesService();
