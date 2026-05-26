/**
 * Workforce service — frontend wrapper for /api/workforce/* (#1349 Phase 1+2).
 *
 * Mirrors the punch in/out + timesheet endpoints. The TimesheetTab + the
 * employer's Workforce settings panel both consume this; no other surface
 * should hit /api/workforce/* directly (single SSoT for API shape).
 */

import { apiClient } from "@/lib/api-client";

export interface TaskTimeEntry {
  id: string;
  taskId: string | null;
  userId: string;
  companyId: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  billable: boolean;
  notes: string | null;
  status: "open" | "closed" | "submitted" | "approved" | "rejected";
  timesheetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Timesheet {
  id: string;
  userId: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  submittedAt: string | null;
  approvedAt: string | null;
  approverId: string | null;
  rejectionReason: string | null;
  totalHours: string | null;
  totalBillableHours: string | null;
  snapshot: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalQueueRow {
  timesheet: Timesheet;
  employeeName: string;
  employeeEmail: string;
}

export interface RosterRow {
  userId: string;
  companyId: string;
  employeeName: string;
  employeeEmail: string;
  isActive: boolean;
  associationCreatedAt: string;
  last7DaysHours: string;
}

async function unwrap<T>(p: Promise<{ data: T }>): Promise<T> {
  const r = await p;
  return r.data;
}

class WorkforceService {
  punchIn(args: { taskId?: string | null; notes?: string | null; billable?: boolean } = {}) {
    return unwrap(apiClient.post<TaskTimeEntry>("/api/workforce/punch-in", args));
  }

  punchOut() {
    return unwrap(apiClient.post<TaskTimeEntry | null>("/api/workforce/punch-out", {}));
  }

  getActive() {
    return unwrap(apiClient.get<TaskTimeEntry | null>("/api/workforce/active"));
  }

  getWeek(periodStart: string) {
    return unwrap(apiClient.get<{ entries: TaskTimeEntry[] }>(
      `/api/workforce/week?periodStart=${encodeURIComponent(periodStart)}`,
    ));
  }

  submitTimesheet(periodStart: string) {
    return unwrap(apiClient.post<Timesheet>("/api/workforce/timesheets/submit", { periodStart }));
  }

  approveTimesheet(id: string) {
    return unwrap(apiClient.post<Timesheet>(`/api/workforce/timesheets/${id}/approve`, {}));
  }

  rejectTimesheet(id: string, reason: string) {
    return unwrap(apiClient.post<Timesheet>(`/api/workforce/timesheets/${id}/reject`, { reason }));
  }

  listMyTimesheets() {
    return unwrap(apiClient.get<{ timesheets: Timesheet[] }>("/api/workforce/timesheets"));
  }

  getApprovalQueue() {
    return unwrap(apiClient.get<{ queue: ApprovalQueueRow[] }>("/api/workforce/approval-queue"));
  }

  getRoster() {
    return unwrap(apiClient.get<{ roster: RosterRow[] }>("/api/workforce/roster"));
  }
}

export const workforceService = new WorkforceService();
