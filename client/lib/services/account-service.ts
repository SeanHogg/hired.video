// Account & Organization Management Service
// Handles API calls for user invitations, role management, and account switching

import {
  AccountUser,
  AccountUsersResponse,
  InviteUserRequest,
  InviteUserResponse,
  UpdateUserRolesRequest,
  AccountSwitchContext,
  AccountOption,
  MyVideoResumeRole,
} from "@/types/account";
import { apiClient } from "@/lib/api-client";

class AccountService {
  // Requests go through apiClient; no per-service base URL or headers needed

  /**
   * Get all users associated with the current account
   */
  async getAccountUsers(): Promise<AccountUser[]> {
    try {
      const response = await apiClient.get<AccountUser[]>("/api/account/users");
      return response.data || [];
    } catch (error) {
      console.error("Error fetching account users:", error);
      throw error;
    }
  }

  /**
   * Invite a new user to the account
   */
  async inviteUser(request: InviteUserRequest): Promise<InviteUserResponse> {
    try {
      const response = await apiClient.post<InviteUserResponse>(
        "/api/account/invite",
        request,
      );
      return response.data;
    } catch (error) {
      console.error("Error inviting user:", error);
      throw error;
    }
  }

  /**
   * Update user roles within the account
   */
  async updateUserRoles(request: UpdateUserRolesRequest): Promise<void> {
    try {
      await apiClient.put("/api/account/roles", request);
    } catch (error) {
      console.error("Error updating user roles:", error);
      throw error;
    }
  }

  /**
   * Remove a user from the account
   */
  async removeUser(userId: string): Promise<void> {
    try {
      await apiClient.delete(`/api/account/users/${userId}`);
    } catch (error) {
      console.error("Error removing user:", error);
      throw error;
    }
  }

  /**
   * Resend invitation to a user
   */
  async resendInvitation(userId: string): Promise<void> {
    try {
      await apiClient.post("/api/account/invite/resend", { userId });
    } catch (error) {
      console.error("Error resending invitation:", error);
      throw error;
    }
  }

  /**
   * Get available accounts for the current user (for account switching)
   */
  async getAvailableAccounts(): Promise<AccountOption[]> {
    try {
      const response = await apiClient.get<any[]>("/api/account/available");
      const accounts = response.data || [];

      return accounts.map((account: any) => ({
        id: account.id,
        name: account.name,
        role: account.role,
        logoUrl: account.logoUrl ?? undefined,
        isOwner: account.role === MyVideoResumeRole.AccountOwner,
        isAdmin: account.role === MyVideoResumeRole.AccountAdmin,
      }));
    } catch (error) {
      console.error("Error fetching available accounts:", error);
      return [];
    }
  }

  /**
   * Switch to a different account context
   */
  async switchAccount(accountId: string): Promise<any> {
    try {
      const response = await apiClient.post<any>(
        "/api/account/switch",
        { accountId },
      );

      localStorage.setItem("currentAccountId", accountId);
      return response.data;
    } catch (error) {
      console.error("Error switching account:", error);
      throw error;
    }
  }

  /**
   * Get current account context
   */
  getCurrentAccountContext(): AccountSwitchContext {
    const currentAccountId = localStorage.getItem("currentAccountId");
    // This will be populated by getAvailableAccounts()
    return {
      currentAccountId: currentAccountId || undefined,
      availableAccounts: [],
    };
  }

  /**
   * Accept an invitation to join an account
   */
  async acceptInvitation(inviteId: string): Promise<void> {
    try {
      await apiClient.post("/api/account/invite/accept", { inviteId });
    } catch (error) {
      console.error("Error accepting invitation:", error);
      throw error;
    }
  }

  /**
   * Reject an invitation to join an account
   */
  async rejectInvitation(inviteId: string): Promise<void> {
    try {
      await apiClient.post("/api/account/invite/reject", { inviteId });
    } catch (error) {
      console.error("Error rejecting invitation:", error);
      throw error;
    }
  }

  /**
   * Get pending invitations for the current user
   */
  async getPendingInvitations(): Promise<AccountUser[]> {
    try {
      const response = await apiClient.get<AccountUser[]>(
        "/api/account/invitations/pending",
      );
      return response.data || [];
    } catch (error) {
      console.error("Error fetching pending invitations:", error);
      return [];
    }
  }

  /**
   * Get account settings
   */
  async getAccountSettings(): Promise<any> {
    try {
      const response = await apiClient.get<any>("/api/account/settings");
      return response.data;
    } catch (error) {
      console.error("Error fetching account settings:", error);
      throw error;
    }
  }

  /**
   * Update account settings
   */
  async updateAccountSettings(settings: any): Promise<any> {
    try {
      const response = await apiClient.post<any>("/api/account/settings", settings);
      return response.data;
    } catch (error) {
      console.error("Error updating account settings:", error);
      throw error;
    }
  }

  /**
   * Get account analytics
   */
  async getAccountAnalytics(): Promise<any> {
    try {
      const response = await apiClient.get<any>("/api/account/analytics");
      return response.data;
    } catch (error) {
      console.error("Error fetching account analytics:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const accountService = new AccountService();
export default accountService;
