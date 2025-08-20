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
      const { data } = await apiClient.requestRaw<AccountUsersResponse>(
        "/account/users",
        { method: "GET" },
      );

      if (data.errorMessage) {
        throw new Error(data.errorMessage);
      }

      return data.result || [];
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
      const { data } = await apiClient.requestRaw<InviteUserResponse>(
        "/account/invite",
        { method: "POST", body: request },
      );
      return data;
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
      await apiClient.requestRaw(
        "/account/roles",
        { method: "PUT", body: request },
      );
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
      await apiClient.requestRaw(
        `/account/users/${userId}`,
        { method: "DELETE" },
      );
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
      await apiClient.requestRaw(
        "/account/invite/resend",
        { method: "POST", body: { userId } },
      );
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
      const { data } = await apiClient.requestRaw<{ result?: any[] }>(
        "/account/available",
        { method: "GET" },
      );
      const accounts = data.result || [];

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
      const { data } = await apiClient.requestRaw<{ result?: any }>(
        "/account/switch",
        { method: "POST", body: { accountId } },
      );

      const switchResult = data.result;
      localStorage.setItem("currentAccountId", accountId);
      return switchResult;
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
      await apiClient.requestRaw(
        "/account/invite/accept",
        { method: "POST", body: { inviteId } },
      );
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
      await apiClient.requestRaw(
        "/account/invite/reject",
        { method: "POST", body: { inviteId } },
      );
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
      const { data } = await apiClient.requestRaw<{ result?: AccountUser[] }>(
        "/account/invitations/pending",
        { method: "GET" },
      );
      return data.result || [];
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
      const { data } = await apiClient.requestRaw<{ result?: any }>(
        "/account/settings",
        { method: "GET" },
      );
      return data.result || data;
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
      const { data } = await apiClient.requestRaw<{ result?: any }>(
        "/account/settings",
        { method: "POST", body: settings },
      );
      return data.result || data;
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
      const { data } = await apiClient.requestRaw<{ result?: any }>(
        "/account/analytics",
        { method: "GET" },
      );
      return data.result || data;
    } catch (error) {
      console.error("Error fetching account analytics:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const accountService = new AccountService();
export default accountService;
