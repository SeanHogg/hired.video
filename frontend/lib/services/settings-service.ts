/**
 * Settings Service
 * Handles user settings and preferences API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";

// ============================================================================
// SCHEMAS
// ============================================================================

// Frontend simplified notifications model (UI)
export const NotificationSettingsSchema = z.object({
  email: z.boolean(),
  push: z.boolean(),
  marketing: z.boolean(),
  weekly: z.boolean(),
});

// Backend DTO shape for privacy preferences (as returned by /api/Settings/privacy)
const BackendPrivacyPreferencesSchema = z.object({
  profileVisibleToPublic: z.boolean().optional(),
  profileVisibleToRecruiters: z.boolean().optional(),
  allowSearchEngineIndexing: z.boolean().optional(),
  showActivityStatus: z.boolean().optional(),
  showConnectionsList: z.boolean().optional(),
  allowDirectMessages: z.boolean().optional(),
  allowConnectionRequests: z.boolean().optional(),
  // Contact visibility flags
  showEmail: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showLocation: z.boolean().optional(),
  allowMessaging: z.boolean().optional(),
  // Data sharing
  shareAnalyticsData: z.boolean().optional(),
  shareUsageData: z.boolean().optional(),
  allowDataExport: z.boolean().optional(),
});

// Frontend privacy settings (UI model)

// Backend DTO for notifications
const BackendNotificationPreferencesSchema = z.object({
  emailJobMatches: z.boolean().optional(),
  emailApplicationUpdates: z.boolean().optional(),
  emailMessages: z.boolean().optional(),
  emailConnectionRequests: z.boolean().optional(),
  emailWeeklyDigest: z.boolean().optional(),
  emailMarketingUpdates: z.boolean().optional(),
  pushJobMatches: z.boolean().optional(),
  pushApplicationUpdates: z.boolean().optional(),
  pushMessages: z.boolean().optional(),
  pushConnectionRequests: z.boolean().optional(),
  smsImportantUpdates: z.boolean().optional(),
  smsSecurityAlerts: z.boolean().optional(),
});

export const PrivacySettingsSchema = z.object({
  profileVisible: z.boolean(),
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  showLocation: z.boolean().optional(),
  indexable: z.boolean(),
  allowMessages: z.boolean().optional(),
  showActivity: z.boolean().optional(),
});

export const JobPreferencesSchema = z.object({
  // Job search settings
  autoApplyEnabled: z.boolean().optional(),
  preferredJobTypes: z.array(z.string()).optional(),
  preferredIndustries: z.array(z.string()).optional(),
  preferredLocations: z.array(z.string()).optional(),
  remoteOnly: z.boolean().optional(),
  willingToRelocate: z.boolean().optional(),

  // Salary preferences
  minSalaryExpectation: z.number().nullish().optional(),
  maxSalaryExpectation: z.number().nullish().optional(),
  salaryCurrency: z.string().optional(),
  salaryPeriod: z.string().optional(), // yearly, monthly, hourly

  // Availability
  availableFrom: z.string().nullish().optional(), // ISO date string
  noticePeriodDays: z.number().nullish().optional(),

  // Advanced preferences
  preferredWorkingHours: z.array(z.string()).optional(),
  jobMatchThreshold: z.number().nullish().optional(),
  onlyExactMatches: z.boolean().optional(),
  excludedCompanies: z.array(z.string()).optional(),
  excludedKeywords: z.array(z.string()).optional(),
});

export const AccountSettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
  dateFormat: z.string().optional(),
});

export const SecuritySettingsSchema = z.object({
  twoFactorEnabled: z.boolean(),
  loginNotifications: z.boolean(),
  sessionTimeout: z.number().optional(),
  allowedDevices: z.array(z.string()).optional(),
});

export const AllSettingsSchema = z.object({
  notifications: NotificationSettingsSchema,
  privacy: PrivacySettingsSchema,
  jobPreferences: JobPreferencesSchema,
  account: AccountSettingsSchema,
  security: SecuritySettingsSchema,
});

// ============================================================================
// TYPES
// ============================================================================

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;
export type PrivacySettings = z.infer<typeof PrivacySettingsSchema>;
export type JobPreferences = z.infer<typeof JobPreferencesSchema>;
export type AccountSettings = z.infer<typeof AccountSettingsSchema>;
export type SecuritySettings = z.infer<typeof SecuritySettingsSchema>;
export type AllSettings = z.infer<typeof AllSettingsSchema>;

// ============================================================================
// SETTINGS SERVICE CLASS
// ============================================================================

export class SettingsService {
  /**
   * Get all user settings
   */
  async getAllSettings(): Promise<AllSettings> {
    const response = await apiClient.get<AllSettings>(
      "/api/Settings",
      AllSettingsSchema,
    );
    return response.data;
  }

  // Small mapper to convert backend DTO -> frontend UI model
  private mapPrivacyFromBackend(dto: z.infer<typeof BackendPrivacyPreferencesSchema>): PrivacySettings {
    return {
      profileVisible: dto.profileVisibleToPublic ?? true,
      showEmail: dto.showEmail ?? false,
      showPhone: dto.showPhone ?? false,
      showLocation: dto.showLocation ?? false,
      indexable: dto.allowSearchEngineIndexing ?? true,
      allowMessages: dto.allowMessaging ?? dto.allowDirectMessages ?? true,
      showActivity: dto.showActivityStatus ?? true,
    };
  }

  // Map backend notifications -> simplified UI model
  private mapNotificationsFromBackend(dto: z.infer<typeof BackendNotificationPreferencesSchema>): NotificationSettings {
    const email = Boolean(
      dto.emailMessages ?? dto.emailApplicationUpdates ?? dto.emailJobMatches ?? dto.emailConnectionRequests ?? true,
    );
    const push = Boolean(
      dto.pushMessages ?? dto.pushApplicationUpdates ?? dto.pushJobMatches ?? dto.pushConnectionRequests ?? true,
    );
    return {
      email,
      push,
      marketing: dto.emailMarketingUpdates ?? false,
      weekly: dto.emailWeeklyDigest ?? true,
    };
  }

  // Map simplified UI model -> backend notifications DTO
  private mapNotificationsToBackend(settings: Partial<NotificationSettings>): Partial<z.infer<typeof BackendNotificationPreferencesSchema>> {
    const payload: Record<string, boolean> = {};
    if (typeof settings.email === "boolean") {
      payload.emailMessages = settings.email;
      payload.emailApplicationUpdates = settings.email;
      payload.emailJobMatches = settings.email;
      payload.emailConnectionRequests = settings.email;
    }
    if (typeof settings.push === "boolean") {
      payload.pushMessages = settings.push;
      payload.pushApplicationUpdates = settings.push;
      payload.pushJobMatches = settings.push;
      payload.pushConnectionRequests = settings.push;
    }
    if (typeof settings.marketing === "boolean") {
      payload.emailMarketingUpdates = settings.marketing;
    }
    if (typeof settings.weekly === "boolean") {
      payload.emailWeeklyDigest = settings.weekly;
    }
    return payload;
  }

  // Small mapper to convert frontend UI model -> backend DTO
  private mapPrivacyToBackend(settings: Partial<PrivacySettings>): Partial<z.infer<typeof BackendPrivacyPreferencesSchema>> {
    const payload: Record<string, boolean> = {};
    if (typeof settings.profileVisible === "boolean") {
      payload.profileVisibleToPublic = settings.profileVisible;
    }
    if (typeof settings.indexable === "boolean") {
      payload.allowSearchEngineIndexing = settings.indexable;
    }
    if (typeof settings.showEmail === "boolean") {
      payload.showEmail = settings.showEmail;
    }
    if (typeof settings.showPhone === "boolean") {
      payload.showPhone = settings.showPhone;
    }
    if (typeof settings.showLocation === "boolean") {
      payload.showLocation = settings.showLocation;
    }
    if (typeof settings.allowMessages === "boolean") {
      payload.allowDirectMessages = settings.allowMessages;
    }
    if (typeof settings.showActivity === "boolean") {
      payload.showActivityStatus = settings.showActivity;
    }
    return payload;
  }

  // ============================================================================
  // NOTIFICATION SETTINGS
  // ============================================================================

  /**
   * Get notification settings
   */
  async getNotificationSettings(): Promise<NotificationSettings> {
    const response = await apiClient.get<z.infer<typeof BackendNotificationPreferencesSchema>>(
      "/api/Settings/notifications",
      BackendNotificationPreferencesSchema,
    );
    return this.mapNotificationsFromBackend(response.data);
  }

  /**
   * Update notification settings
   */
  async updateNotificationSettings(
    settings: Partial<NotificationSettings>,
  ): Promise<NotificationSettings> {
    const payload = this.mapNotificationsToBackend(settings);
    const response = await apiClient.put<z.infer<typeof BackendNotificationPreferencesSchema>>(
      "/api/Settings/notifications",
      payload,
      BackendNotificationPreferencesSchema,
    );
    return this.mapNotificationsFromBackend(response.data);
  }

  // ============================================================================
  // PRIVACY SETTINGS
  // ============================================================================

  /**
   * Get privacy settings
   */
  async getPrivacySettings(): Promise<PrivacySettings> {
    // Use backend schema, then map to UI model
    const response = await apiClient.get<z.infer<typeof BackendPrivacyPreferencesSchema>>(
      "/api/Settings/privacy",
      BackendPrivacyPreferencesSchema,
    );
    return this.mapPrivacyFromBackend(response.data);
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(
    settings: Partial<PrivacySettings>,
  ): Promise<PrivacySettings> {
    const payload = this.mapPrivacyToBackend(settings);
    const response = await apiClient.put<z.infer<typeof BackendPrivacyPreferencesSchema>>(
      "/api/Settings/privacy",
      payload,
      BackendPrivacyPreferencesSchema,
    );
    return this.mapPrivacyFromBackend(response.data);
  }

  // ============================================================================
  // JOB PREFERENCES
  // ============================================================================

  /**
   * Get job preferences
   */
  async getJobPreferences(): Promise<JobPreferences> {
    const response = await apiClient.get<JobPreferences>(
      "/api/Settings/job-preferences",
      JobPreferencesSchema,
    );
    return response.data;
  }

  /**
   * Update job preferences
   */
  async updateJobPreferences(
    preferences: Partial<JobPreferences>,
  ): Promise<JobPreferences> {
    const response = await apiClient.put<JobPreferences>(
      "/api/Settings/job-preferences",
      preferences,
      JobPreferencesSchema,
    );
    return response.data;
  }

  // ============================================================================
  // ACCOUNT SETTINGS
  // ============================================================================

  /**
   * Get account settings
   */
  async getAccountSettings(): Promise<AccountSettings> {
    const response = await apiClient.get<AccountSettings>(
      "/api/Settings/account",
      AccountSettingsSchema,
    );
    return response.data;
  }

  /**
   * Update account settings
   */
  async updateAccountSettings(
    settings: Partial<AccountSettings>,
  ): Promise<AccountSettings> {
    const response = await apiClient.put<AccountSettings>(
      "/api/Settings/account",
      settings,
      AccountSettingsSchema,
    );
    return response.data;
  }

  // ============================================================================
  // SECURITY SETTINGS
  // ============================================================================

  /**
   * Get security settings
   */
  async getSecuritySettings(): Promise<SecuritySettings> {
    const response = await apiClient.get<SecuritySettings>(
      "/api/Settings/security",
      SecuritySettingsSchema,
    );
    return response.data;
  }

  // ============================================================================
  // EXTENSION PREFERENCES
  // ============================================================================

  async getExtensionSettings(): Promise<ExtensionSettings> {
    const response = await apiClient.get<ExtensionSettings>(
      "/api/Settings/extension-preferences",
      ExtensionSettingsSchema,
    );
    return response.data;
  }

  /**
   * Patch-style update — send only the surfaces/keys that changed. The
   * server merges over the stored blob so partial updates don't wipe
   * other surface settings.
   */
  async updateExtensionSettings(
    patch: DeepPartial<ExtensionSettings>,
  ): Promise<ExtensionSettings> {
    const response = await apiClient.put<ExtensionSettings>(
      "/api/Settings/extension-preferences",
      patch,
      ExtensionSettingsSchema,
    );
    return response.data;
  }

  /**
   * Update security settings
   */
  async updateSecuritySettings(
    settings: Partial<SecuritySettings>,
  ): Promise<SecuritySettings> {
    const response = await apiClient.put<SecuritySettings>(
      "/api/Settings/security",
      settings,
      SecuritySettingsSchema,
    );
    return response.data;
  }

  /**
   * Enable two-factor authentication
   */
  async enableTwoFactor(): Promise<{ qrCode: string; backupCodes: string[] }> {
    const response = await apiClient.post<{
      qrCode: string;
      backupCodes: string[];
    }>(
      "/api/Settings/security/2fa/enable",
      {},
      z.object({
        qrCode: z.string(),
        backupCodes: z.array(z.string()),
      }),
    );
    return response.data;
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactor(code: string): Promise<void> {
    await apiClient.post("/api/Settings/security/2fa/disable", { code });
  }

  // ============================================================================
  // DATA EXPORT & ACCOUNT MANAGEMENT
  // ============================================================================

  /**
   * Export user data (GDPR compliance)
   */
  async exportUserData(): Promise<Blob> {
    const response = await apiClient.request<Blob>("/api/Settings/export", {
      method: "GET",
    });
    return response.data;
  }

  async getLinkedSecuritySettings(): Promise<any> {
    const response = await apiClient.get("/api/settings/security");
    return response.data;
  }

  async unlinkOAuthProvider(provider: string): Promise<void> {
    await apiClient.delete(`/api/auth/oauth/unlink/${provider}`);
  }

  /**
   * Delete user account
   */
  async deleteAccount(): Promise<void> {
    await apiClient.post("/api/account/deleteaccount");
  }

  /**
   * Request account deletion (with confirmation email)
   */
  async requestAccountDeletion(): Promise<void> {
    // No dedicated request endpoint. Use deleteAccount flow which performs soft delete per business rules.
    await this.deleteAccount();
  }

}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const settingsService = new SettingsService();
export default settingsService;
