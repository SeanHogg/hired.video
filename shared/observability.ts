/**
 * API-health report wire shapes — GET /api/admin/usage/api-health
 * (api/src/repositories/observabilityRepository.ts) and its admin view.
 * Built from request_logs (30 days) + the latest config snapshot.
 */

export interface RouteUsageRow {
  route: string;
  calls: number;
  serverErrors: number;
  clientErrors: number;
  avgMs: number | null;
  lastSeen: string | null;
}

export interface RouteErrorRow {
  route: string;
  status: number | null;
  errorCode: string | null;
  errorSource: string | null;
  count: number;
  lastSeen: string | null;
}

export interface ReleaseTrafficRow {
  releaseId: string | null;
  requests: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface ConfigSnapshotRow {
  recordedAt: string;
  metadata: unknown;
}

export interface ApiHealthReport {
  activeUsers: { dau: number; wau: number; mau: number };
  routes: RouteUsageRow[];
  errors: RouteErrorRow[];
  releases: ReleaseTrafficRow[];
  totals: { requests: number; serverErrors: number; serverErrorRate: number };
  topEvents: Array<{ event: string; count: number }>;
  configSnapshot: ConfigSnapshotRow | null;
}
