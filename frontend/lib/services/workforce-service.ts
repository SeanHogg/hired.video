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

export interface DeskMarginRow {
  placementId: string;
  candidateId: string;
  candidateName: string;
  recruiterId: string | null;
  recruiterName: string | null;
  placementKind: string | null;
  startDate: string | null;
  endDate: string | null;
  billRateHourly: number;
  payRateHourly: number;
  currency: string;
  billableHoursYTD: number;
  totalHoursYTD: number;
  revenueCents: number;
  payoutCents: number;
  grossMarginCents: number;
  approvedTimesheetCount: number;
}

export interface PlacementDocument {
  id: string;
  placementId: string | null;
  companyId: string | null;
  userId: string | null;
  kind: string;
  filePath: string | null;
  providerName: string | null;
  providerRef: string | null;
  signedAt: string | null;
  expiresAt: string | null;
  status: "pending" | "signed" | "expired" | "revoked";
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentInput {
  placementId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  kind: string;
  filePath?: string | null;
  providerName?: string | null;
  providerRef?: string | null;
  signedAt?: string | null;
  expiresAt?: string | null;
}

export interface SeatReconcileResult {
  companyId: string;
  previousSeatCount: number;
  newSeatCount: number;
  pricePerSeatCents: number;
  totalMonthlyCents: number;
  delta: number;
}

export interface TokenPoolMember {
  userId: string;
  name: string;
  email: string;
  monthlyTokenLimit: number | null;
  monthlyUsed: number;
}

export interface TokenPoolView {
  companyId: string;
  budget: {
    monthlyLimit: number;
    monthlyUsed: number;
    monthlyRemaining: number;
    packBalance: number;
    totalAvailable: number;
    seatCount: number;
  };
  members: TokenPoolMember[];
}

export type IntegrationProvider =
  | "quickbooks" | "xero" | "gusto" | "docusign" | "helcim";

export interface Integration {
  id: string;
  companyId: string;
  provider: IntegrationProvider;
  status: "connected" | "disconnected" | "error";
  externalAccountId: string | null;
  expiresAt: string | null;
  scopes: unknown;
  lastSyncAt: string | null;
  lastError: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

class WorkforceService {
  punchIn(args: { taskId?: string | null; notes?: string | null; billable?: boolean } = {}) {
    return apiClient.fetchData<TaskTimeEntry>("/api/workforce/punch-in", { method: "POST", body: args });
  }

  punchOut() {
    return apiClient.fetchData<TaskTimeEntry | null>("/api/workforce/punch-out", { method: "POST", body: {} });
  }

  getActive() {
    return apiClient.fetchData<TaskTimeEntry | null>("/api/workforce/active");
  }

  getWeek(periodStart: string) {
    return apiClient.fetchData<{ entries: TaskTimeEntry[] }>(`/api/workforce/week?periodStart=${encodeURIComponent(periodStart)}`);
  }

  submitTimesheet(periodStart: string) {
    return apiClient.fetchData<Timesheet>("/api/workforce/timesheets/submit", { method: "POST", body: { periodStart } });
  }

  approveTimesheet(id: string) {
    return apiClient.fetchData<Timesheet>(`/api/workforce/timesheets/${id}/approve`, { method: "POST", body: {} });
  }

  rejectTimesheet(id: string, reason: string) {
    return apiClient.fetchData<Timesheet>(`/api/workforce/timesheets/${id}/reject`, { method: "POST", body: { reason } });
  }

  listMyTimesheets() {
    return apiClient.fetchData<{ timesheets: Timesheet[] }>("/api/workforce/timesheets");
  }

  getApprovalQueue() {
    return apiClient.fetchData<{ queue: ApprovalQueueRow[] }>("/api/workforce/approval-queue");
  }

  getRoster() {
    return apiClient.fetchData<{ roster: RosterRow[] }>("/api/workforce/roster");
  }

  getDeskMargin() {
    return apiClient.fetchData<{ rows: DeskMarginRow[] }>("/api/workforce/desk-margin");
  }

  listDocuments() {
    return apiClient.fetchData<{ documents: PlacementDocument[] }>("/api/workforce/documents");
  }

  createDocument(input: CreateDocumentInput) {
    return apiClient.fetchData<PlacementDocument>("/api/workforce/documents", { method: "POST", body: input });
  }

  reconcileSeats() {
    return apiClient.fetchData<{ results: SeatReconcileResult[] }>("/api/workforce/reconcile-seats", { method: "POST", body: {} });
  }

  /** Deactivate an employee (off-board). Hits the existing account API
   *  rather than a workforce-specific route — removeAccountUser handles
   *  the UCRA flip + workforce seat reconciliation (#1406). */
  deactivateEmployee(userId: string) {
    return apiClient.delete<{ success: boolean }>(`/api/account/users/${userId}`);
  }

  listIntegrations() {
    return apiClient.fetchData<{ integrations: Integration[] }>("/api/workforce/integrations");
  }

  disconnectIntegration(provider: IntegrationProvider, companyId: string) {
    return apiClient.fetchData<{ disconnected: boolean }>(`/api/workforce/integrations/${provider}/disconnect`, { method: "POST", body: { companyId } });
  }

  /** Employer's shared AI token pool + per-member usage/sub-caps (#1679).
   *  Resolves to null when the caller manages no workspace (an empty state,
   *  not an error — the endpoint returns 200 with `pool: null`). */
  async getTokenPool(): Promise<TokenPoolView | null> {
    const { pool } = await apiClient.fetchData<{ pool: TokenPoolView | null }>("/api/workforce/token-pool");
    return pool;
  }

  /** Set (number) or clear (null) a member's monthly AI-token sub-cap. */
  setMemberTokenLimit(userId: string, limit: number | null) {
    return apiClient.fetchData<{ updated: boolean }>(`/api/workforce/members/${userId}/token-limit`, { method: "PATCH", body: { limit } });
  }
}

export const workforceService = new WorkforceService();
