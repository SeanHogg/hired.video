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

class ActivitiesService {
  // Employer
  assign(input: AssignActivityInput) {
    return apiClient.fetchData<ActivityDTO>("/api/activities", { method: "POST", body: input });
  }
  listCompanyActivities() {
    return apiClient.fetchData<{ activities: ActivityDTO[] }>("/api/activities/company");
  }
  listAssignableWorkers() {
    return apiClient.fetchData<{ workers: AssignableWorkerDTO[] }>("/api/activities/assignable-workers");
  }
  approve(id: string) {
    return apiClient.fetchData<ActivityDTO>(`/api/activities/${id}/approve`, { method: "POST", body: {} });
  }
  reject(id: string, reason: string) {
    return apiClient.fetchData<ActivityDTO>(`/api/activities/${id}/reject`, { method: "POST", body: { reason } });
  }

  // Worker
  listAssignedToMe() {
    return apiClient.fetchData<{ activities: ActivityDTO[] }>("/api/activities/assigned");
  }
  getActiveTimer() {
    return apiClient.fetchData<ActivityTimeEntry | null>("/api/activities/timer/active");
  }
  startTimer(id: string) {
    return apiClient.fetchData<ActivityTimeEntry>(`/api/activities/${id}/timer/start`, { method: "POST", body: {} });
  }
  stopTimer(id: string) {
    return apiClient.fetchData<ActivityTimeEntry | null>(`/api/activities/${id}/timer/stop`, { method: "POST", body: {} });
  }
  submit(id: string) {
    return apiClient.fetchData<ActivityDTO>(`/api/activities/${id}/submit`, { method: "POST", body: {} });
  }
}

export const activitiesService = new ActivitiesService();
