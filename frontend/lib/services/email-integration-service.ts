/**
 * Frontend client for /api/integrations/email — connect / list /
 * disconnect mailboxes, manage rules, fetch sync history.
 *
 * Manual sync runs in the PWA via `runClientSync`
 * (lib/email-integration/sync-client.ts); the legacy `syncNow` server
 * endpoint was removed in the #757 cutover.
 */

import { apiClient } from "@/lib/api-client";

export type EmailProviderId = "gmail" | "outlook";

export interface ConnectedEmailAccount {
  id: string;
  provider: EmailProviderId | string;
  accountEmail: string;
  accountLabel: string | null;
  status: "active" | "paused" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Per-account confidence floor — only emails the classifier scored
   *  at or above this value reach the inbox feed. */
  minJobScore?: number;
}

export interface EmailUserRule {
  id: string;
  userId: string;
  name: string;
  conditions: Array<{
    field: "from_email" | "from_domain" | "subject" | "body" | "any";
    op: "contains" | "equals" | "starts_with" | "ends_with" | "regex";
    value: string;
    caseSensitive?: boolean;
  }>;
  actionCategory: string;
  actionScore: string | number;
  isEnabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSyncRun {
  id: string;
  accountId: string;
  accountLabel: string | null;
  provider: string | null;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "success" | "partial" | "error";
  messagesSynced: number;
  messagesClassified: number;
  messagesExcluded: number;
  messagesJobRelated: number;
  jobsLinked: number;
  jobsCreated: number;
  rulesFired: Record<string, number>;
  digestSummary: string | null;
  errorMessage: string | null;
}

class EmailIntegrationService {
  /** Build the OAuth start URL for a provider. The browser navigates
   *  here; the API redirects to Google/Microsoft and back to the
   *  callback. Top-level navigation can't carry an Authorization header,
   *  so we pass the user's session JWT as a `link_token` query param —
   *  same pattern as the existing /api/auth/oauth/:provider flow. */
  connectUrl(provider: EmailProviderId, redirect = "/settings?tab=email"): string {
    const apiBase = (
      import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_API_URL ||
      window.location.origin
    ).toString().replace(/\/$/, "");
    const params = new URLSearchParams({ redirect });
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (token) params.set("link_token", token);
    return `${apiBase}/api/integrations/email/${provider}/connect?${params.toString()}`;
  }

  async listAccounts(): Promise<ConnectedEmailAccount[]> {
    const r = await apiClient.get<ConnectedEmailAccount[]>("/api/integrations/email/accounts");
    return r.data ?? [];
  }

  async patchAccount(
    id: string,
    patch: Partial<Pick<ConnectedEmailAccount, "accountLabel" | "status" | "minJobScore">>,
  ): Promise<void> {
    await apiClient.patch(`/api/integrations/email/accounts/${id}`, patch);
  }

  async disconnect(id: string): Promise<void> {
    await apiClient.delete(`/api/integrations/email/accounts/${id}`);
  }

  async listRules(): Promise<EmailUserRule[]> {
    const r = await apiClient.get<EmailUserRule[]>("/api/integrations/email/rules");
    return r.data ?? [];
  }

  async createRule(input: Partial<EmailUserRule>): Promise<EmailUserRule> {
    const r = await apiClient.post<EmailUserRule>("/api/integrations/email/rules", input);
    return r.data!;
  }

  async patchRule(id: string, patch: Partial<EmailUserRule>): Promise<void> {
    await apiClient.patch(`/api/integrations/email/rules/${id}`, patch);
  }

  async deleteRule(id: string): Promise<void> {
    await apiClient.delete(`/api/integrations/email/rules/${id}`);
  }

  async listSyncRuns(limit = 10): Promise<EmailSyncRun[]> {
    const r = await apiClient.get<EmailSyncRun[]>(`/api/integrations/email/sync-runs?limit=${limit}`);
    return r.data ?? [];
  }
}

export const emailIntegrationService = new EmailIntegrationService();
