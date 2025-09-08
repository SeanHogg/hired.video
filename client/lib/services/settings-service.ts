/**
 * Settings Service
 * Handles user settings and preferences API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";

// ============================================================================
// SCHEMAS
// ============================================================================

export const NotificationSettingsSchema = z.object({
  email: z.boolean(),
  push: z.boolean(),
  marketing: z.boolean(),
  weekly: z.boolean(),
  jobAlerts: z.boolean().optional(),
  connectionRequests: z.boolean().optional(),
  messages: z.boolean().optional(),
});

export const PrivacySettingsSchema = z.object({
  profileVisible: z.boolean(),
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  indexable: z.boolean(),
  allowMessages: z.boolean().optional(),
  showActivity: z.boolean().optional(),
});

export const JobPreferencesSchema = z.object({
  desiredRoles: z.array(z.string()).optional(),
  preferredLocations: z.array(z.string()).optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  employmentTypes: z.array(z.string()).optional(),
  remoteWork: z.boolean().optional(),
  openToWork: z.boolean().optional(),
  availabilityDate: z.string().optional(),
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
      "/Settings",
      AllSettingsSchema,
    );
    return response.data;
  }

  // ============================================================================
  // NOTIFICATION SETTINGS
  // ============================================================================

  /**
   * Get notification settings
   */
  async getNotificationSettings(): Promise<NotificationSettings> {
    const response = await apiClient.get<NotificationSettings>(
      "/Settings/notifications",
      NotificationSettingsSchema,
    );
    return response.data;
  }

  /**
   * Update notification settings
   */
  async updateNotificationSettings(
    settings: Partial<NotificationSettings>,
  ): Promise<NotificationSettings> {
    const response = await apiClient.put<NotificationSettings>(
      "/Settings/notifications",
      settings,
      NotificationSettingsSchema,
    );
    return response.data;
  }

  // ============================================================================
  // PRIVACY SETTINGS
  // ============================================================================

  /**
   * Get privacy settings
   */
  async getPrivacySettings(): Promise<PrivacySettings> {
    const response = await apiClient.get<PrivacySettings>(
      "/Settings/privacy",
      PrivacySettingsSchema,
    );
    return response.data;
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(
    settings: Partial<PrivacySettings>,
  ): Promise<PrivacySettings> {
    const response = await apiClient.put<PrivacySettings>(
      "/Settings/privacy",
      settings,
      PrivacySettingsSchema,
    );
    return response.data;
  }

  // ============================================================================
  // JOB PREFERENCES
  // ============================================================================

  /**
   * Get job preferences
   */
  async getJobPreferences(): Promise<JobPreferences> {
    const response = await apiClient.get<JobPreferences>(
      "/Settings/job-preferences",
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
      "/Settings/job-preferences",
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
      "/Settings/account",
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
      "/Settings/account",
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
      "/Settings/security",
      SecuritySettingsSchema,
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
      "/Settings/security",
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
      "/Settings/security/2fa/enable",
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
    await apiClient.post("/Settings/security/2fa/disable", { code });
  }

  // ============================================================================
  // DATA EXPORT & ACCOUNT MANAGEMENT
  // ============================================================================

  /**
   * Export user data (GDPR compliance)
   */
  async exportUserData(): Promise<Blob> {
    const response = await apiClient.request<Blob>("/Settings/export", {
      method: "GET",
    });
    return response.data;
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
    await apiClient.post("/Settings/account/delete-request");
  }

  /**
   * Cancel account deletion request
   */
  async cancelAccountDeletion(token: string): Promise<void> {
    await apiClient.post("/Settings/account/cancel-deletion", { token });
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const settingsService = new SettingsService();
export default settingsService;
