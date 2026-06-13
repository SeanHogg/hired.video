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
  minRelevanceScore?: number;
  /** Active inbox profile assignment; null/undefined = Job Hunter preset. */
  activeProfileId?: string | null;
}

export interface EmailUserRule {
  id: string;
  userId: string;
  /** Inbox profile this rule is scoped to; null = legacy global rule. */
  profileId?: string | null;
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

/** One category in a profile's taxonomy (mirrors shared InboxCategory). */
export interface InboxCategory {
  key: string;
  label: string;
  description?: string;
  visible: boolean;
}

/** Runtime inbox profile (mirrors shared InboxProfileShape). */
export interface InboxProfile {
  id: string;
  ownerId: string | null;
  roles: string[];
  name: string;
  description: string | null;
  isPreset: boolean;
  presetKey: string | null;
  taxonomy: InboxCategory[];
  classifyPrompt: string;
  summaryPrompt: string | null;
  extractSchema: Record<string, unknown> | null;
  defaultRuleSet: string | null;
  minRelevanceScore: number;
  version: number;
}

export interface InboxAction {
  id: string;
  profileId: string;
  ownerId: string | null;
  name: string;
  triggerType: "category" | "rule" | "always";
  triggerValue: string | null;
  handler: string;
  config: Record<string, unknown> | null;
  isEnabled: boolean;
  priority: number;
}

export interface InboxActionRun {
  id: string;
  messageId: string;
  actionId: string;
  handler: string;
  status: "success" | "error" | "skipped";
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

export interface DryRunRow {
  messageId: string;
  from: string;
  subject: string | null;
  category: string;
  score: number;
  source: string;
  visible: boolean;
  extracted: Record<string, unknown> | null;
}

class EmailIntegrationService {
  /** Build the OAuth start URL for a provider. The browser navigates
   *  here; the API redirects to Google/Microsoft and back to the
   *  callback. Top-level navigation can't carry an Authorization header,
   *  so we pass the user's session JWT as a `link_token` query param —
   *  same pattern as the existing /api/auth/oauth/:provider flow. */
  connectUrl(
    provider: EmailProviderId,
    redirect = "/settings?tab=email",
    /** #916 — When set, the connect flow pins this account email into
     *  the state JWT + forwards `login_hint` so the provider's picker
     *  defaults to (and the callback enforces) the same mailbox. */
    reconnectAccountEmail?: string,
  ): string {
    const apiBase = (
      import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_API_URL ||
      window.location.origin
    ).toString().replace(/\/$/, "");
    const params = new URLSearchParams({ redirect });
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (token) params.set("link_token", token);
    if (reconnectAccountEmail) params.set("reconnectAccountEmail", reconnectAccountEmail);
    return `${apiBase}/api/integrations/email/${provider}/connect?${params.toString()}`;
  }

  async listAccounts(): Promise<ConnectedEmailAccount[]> {
    const r = await apiClient.get<ConnectedEmailAccount[]>("/api/integrations/email/accounts");
    return r.data ?? [];
  }

  async patchAccount(
    id: string,
    patch: Partial<Pick<ConnectedEmailAccount, "accountLabel" | "status" | "minRelevanceScore" | "activeProfileId">>,
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

  // ── Inbox processors (profiles + actions + dry-run) ───────────────────────

  async listProfiles(): Promise<InboxProfile[]> {
    const r = await apiClient.get<InboxProfile[]>("/api/integrations/email/profiles");
    return r.data ?? [];
  }

  async getProfile(id: string): Promise<InboxProfile | null> {
    const r = await apiClient.get<InboxProfile>(`/api/integrations/email/profiles/${id}`);
    return r.data ?? null;
  }

  async cloneProfile(sourceProfileId: string, name?: string): Promise<InboxProfile> {
    const r = await apiClient.post<InboxProfile>("/api/integrations/email/profiles", {
      sourceProfileId,
      name,
    });
    return r.data!;
  }

  async updateProfile(id: string, patch: Partial<InboxProfile>): Promise<InboxProfile> {
    const r = await apiClient.patch<InboxProfile>(`/api/integrations/email/profiles/${id}`, patch);
    return r.data!;
  }

  async deleteProfile(id: string): Promise<void> {
    await apiClient.delete(`/api/integrations/email/profiles/${id}`);
  }

  async dryRunProfile(
    id: string,
    sampleSize = 10,
  ): Promise<{ profileName: string; rows: DryRunRow[] }> {
    const r = await apiClient.post<{ profileName: string; rows: DryRunRow[] }>(
      `/api/integrations/email/profiles/${id}/dry-run`,
      { sampleSize },
    );
    return r.data ?? { profileName: "", rows: [] };
  }

  async listProfileActions(profileId: string): Promise<InboxAction[]> {
    const r = await apiClient.get<InboxAction[]>(
      `/api/integrations/email/profiles/${profileId}/actions`,
    );
    return r.data ?? [];
  }

  async createAction(profileId: string, input: Partial<InboxAction>): Promise<InboxAction> {
    const r = await apiClient.post<InboxAction>(
      `/api/integrations/email/profiles/${profileId}/actions`,
      input,
    );
    return r.data!;
  }

  async patchAction(id: string, patch: Partial<InboxAction>): Promise<void> {
    await apiClient.patch(`/api/integrations/email/actions/${id}`, patch);
  }

  async deleteAction(id: string): Promise<void> {
    await apiClient.delete(`/api/integrations/email/actions/${id}`);
  }

  async listProfileRules(profileId: string): Promise<EmailUserRule[]> {
    const r = await apiClient.get<EmailUserRule[]>(
      `/api/integrations/email/rules?profileId=${encodeURIComponent(profileId)}`,
    );
    return r.data ?? [];
  }

  async listActionRuns(limit = 25): Promise<InboxActionRun[]> {
    const r = await apiClient.get<InboxActionRun[]>(
      `/api/integrations/email/action-runs?limit=${limit}`,
    );
    return r.data ?? [];
  }
}

export const emailIntegrationService = new EmailIntegrationService();
