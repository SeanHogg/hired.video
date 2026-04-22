/**
 * SuperAdmin impersonation client service.
 *
 * Thin, typed wrappers around /api/admin/impersonate/* session endpoints.
 * AuthProvider calls these and owns React state (session object, token ref,
 * query-cache invalidation) — the service only speaks HTTP.
 */

import { apiClient } from "../api-client";

export interface StartImpersonationResponse {
  sessionId: string;
  token: string;
  user: { id: string; email: string; name: string };
  role: string;
  startedAt: string;
  expiresAt: string;
}

export interface ActiveSession {
  id: string;
}

export async function startImpersonation(
  targetUserId: string,
  reason: string,
  enableDebugger = false,
): Promise<StartImpersonationResponse> {
  const res = await apiClient.post<StartImpersonationResponse>(
    "/api/admin/impersonate",
    { targetUserId, reason, enableDebugger },
  );
  return res.data;
}

export async function endImpersonation(sessionId: string): Promise<void> {
  await apiClient.post(`/api/admin/impersonate/${sessionId}/end`);
}

export async function switchImpersonationRole(
  sessionId: string,
  role: string,
): Promise<{ token: string; role: string }> {
  const res = await apiClient.post<{ token: string; role: string }>(
    `/api/admin/impersonate/${sessionId}/switch-role`,
    { role },
  );
  return res.data;
}

export async function getActiveImpersonation(): Promise<ActiveSession | null> {
  const res = await apiClient.get<ActiveSession | null>("/api/admin/impersonate/active");
  return res.data ?? null;
}
