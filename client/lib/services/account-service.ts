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

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

class AccountService {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("authToken");
    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  /**
   * Get all users associated with the current account
   */
  async getAccountUsers(): Promise<AccountUser[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/account/users`, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch account users: ${response.statusText}`,
        );
      }

      const data: AccountUsersResponse = await response.json();

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
      const response = await fetch(`${API_BASE_URL}/api/account/invite`, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Failed to invite user: ${response.statusText}`);
      }

      const data: InviteUserResponse = await response.json();
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
      const response = await fetch(`${API_BASE_URL}/api/account/roles`, {
        method: "PUT",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Failed to update user roles: ${response.statusText}`);
      }
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
      const response = await fetch(
        `${API_BASE_URL}/api/account/users/${userId}`,
        {
          method: "DELETE",
          headers: this.getAuthHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to remove user: ${response.statusText}`);
      }
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
      const response = await fetch(
        `${API_BASE_URL}/api/account/invite/resend`,
        {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ userId }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to resend invitation: ${response.statusText}`);
      }
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
      const response = await fetch(`${API_BASE_URL}/api/account/available`, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch available accounts: ${response.statusText}`,
        );
      }

      const data = await response.json();
      const accounts = data.result || [];

      // Transform backend DTO to frontend interface
      return accounts.map((account: any) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        role: account.role,
        isCurrent: account.isCurrent,
        logoUrl: account.logoUrl,
        memberCount: account.memberCount,
        isActive: account.isActive,
        joinedDate: new Date(account.joinedDate),
      }));
    } catch (error) {
      console.error("Error fetching available accounts:", error);
      // Return empty array if API not implemented yet
      return [];
    }
  }

  /**
   * Switch to a different account context
   */
  async switchAccount(accountId: string): Promise<any> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/account/switch`, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ accountId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to switch account: ${response.statusText}`);
      }

      const data = await response.json();
      const switchResult = data.result;

      // Update local storage with new account context
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
      const response = await fetch(
        `${API_BASE_URL}/api/account/invite/accept`,
        {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ inviteId }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to accept invitation: ${response.statusText}`);
      }
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
      const response = await fetch(
        `${API_BASE_URL}/api/account/invite/reject`,
        {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ inviteId }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to reject invitation: ${response.statusText}`);
      }
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
      const response = await fetch(
        `${API_BASE_URL}/api/account/invitations/pending`,
        {
          method: "GET",
          headers: this.getAuthHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch pending invitations: ${response.statusText}`,
        );
      }

      const data = await response.json();
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
      const response = await fetch(`${API_BASE_URL}/api/account/settings`, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch account settings: ${response.statusText}`,
        );
      }

      const data = await response.json();
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
      const response = await fetch(`${API_BASE_URL}/api/account/settings`, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to update account settings: ${response.statusText}`,
        );
      }

      const data = await response.json();
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
      const response = await fetch(`${API_BASE_URL}/api/account/analytics`, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch account analytics: ${response.statusText}`,
        );
      }

      const data = await response.json();
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
