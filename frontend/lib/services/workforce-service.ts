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

  getDeskMargin() {
    return unwrap(apiClient.get<{ rows: DeskMarginRow[] }>("/api/workforce/desk-margin"));
  }

  listDocuments() {
    return unwrap(apiClient.get<{ documents: PlacementDocument[] }>("/api/workforce/documents"));
  }

  createDocument(input: CreateDocumentInput) {
    return unwrap(apiClient.post<PlacementDocument>("/api/workforce/documents", input));
  }

  reconcileSeats() {
    return unwrap(apiClient.post<{ results: SeatReconcileResult[] }>("/api/workforce/reconcile-seats", {}));
  }

  /** Deactivate an employee (off-board). Hits the existing account API
   *  rather than a workforce-specific route — removeAccountUser handles
   *  the UCRA flip + workforce seat reconciliation (#1406). */
  deactivateEmployee(userId: string) {
    return apiClient.delete<{ success: boolean }>(`/api/account/users/${userId}`);
  }

  listIntegrations() {
    return unwrap(apiClient.get<{ integrations: Integration[] }>("/api/workforce/integrations"));
  }

  disconnectIntegration(provider: IntegrationProvider, companyId: string) {
    return unwrap(apiClient.post<{ disconnected: boolean }>(
      `/api/workforce/integrations/${provider}/disconnect`,
      { companyId },
    ));
  }

  /** Employer's shared AI token pool + per-member usage/sub-caps (#1679). */
  getTokenPool() {
    return unwrap(apiClient.get<TokenPoolView>("/api/workforce/token-pool"));
  }

  /** Set (number) or clear (null) a member's monthly AI-token sub-cap. */
  setMemberTokenLimit(userId: string, limit: number | null) {
    return unwrap(apiClient.patch<{ updated: boolean }>(
      `/api/workforce/members/${userId}/token-limit`,
      { limit },
    ));
  }
}

export const workforceService = new WorkforceService();
