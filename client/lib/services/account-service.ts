// Account & Organization Management Service
// Handles API calls for user invitations, role management, and account switching

import {
  AccountUser,
  InviteUserRequest,
  InviteUserResponse,
  UpdateUserRolesRequest,
  AccountSwitchContext,
  AccountOption,
  BulkInviteUsersRequest,
  BulkInviteUsersResponse,
  InvitationDetailsResponse,
  AcceptInvitationResponse,
} from "@/types/account";
import { apiClient } from "@/lib/api-client";

class AccountService {
  // Requests go through apiClient; no per-service base URL or headers needed

  /**
   * Get all users associated with the current account
   * Returns a flattened list of account users with user profile data
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
        isOwner: account.role === "Admin",
        isAdmin: account.role === "Admin" || account.role === "Business",
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
   * Get invitation details
   */
  async getInvitationDetails(invitationId: string): Promise<InvitationDetailsResponse> {
    try {
      const response = await apiClient.get<InvitationDetailsResponse>(
        `/api/account/invitation/${invitationId}`,
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching invitation details:", error);
      throw error;
    }
  }

  /**
   * Accept an invitation to join an account
   */
  async acceptInvitation(invitationId: string): Promise<AcceptInvitationResponse> {
    try {
      const response = await apiClient.post<AcceptInvitationResponse>(
        `/api/account/accept-invitation/${invitationId}`,
      );
      return response.data;
    } catch (error) {
      console.error("Error accepting invitation:", error);
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

  /**
   * Send bulk invitations to multiple users
   */
  async bulkInviteUsers(request: BulkInviteUsersRequest): Promise<BulkInviteUsersResponse> {
    try {
      const response = await apiClient.post<BulkInviteUsersResponse>(
        "/api/account/bulk-invite",
        request,
      );
      return response.data;
    } catch (error) {
      console.error("Error sending bulk invitations:", error);
      throw error;
    }
  }

  /**
   * Resend an invitation
   */
  async resendInvitation(invitationId: string): Promise<void> {
    try {
      await apiClient.post(`/api/account/invitation/${invitationId}/resend`);
    } catch (error) {
      console.error("Error resending invitation:", error);
      throw error;
    }
  }

  /**
   * Cancel an invitation
   */
  async cancelInvitation(invitationId: string): Promise<void> {
    try {
      await apiClient.post(`/api/account/invitation/${invitationId}/cancel`);
    } catch (error) {
      console.error("Error canceling invitation:", error);
      throw error;
    }
  }

  /**
   * Get invitation analytics
   */
  async getInvitationAnalytics(): Promise<any> {
    try {
      const response = await apiClient.get("/api/account/invitation-analytics");
      return response.data;
    } catch (error) {
      console.error("Error fetching invitation analytics:", error);
      throw error;
    }
  }

  /**
   * Delete the current user's account
   * Note: The backend automatically signs out the user, so no separate logout call is needed
   */
  async deleteAccount(): Promise<void> {
    try {
      await apiClient.post("/api/account/deleteaccount");
      // Backend automatically signs out the user, so we don't need to call logout
    } catch (error) {
      console.error("Error deleting account:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const accountService = new AccountService();
export default accountService;
