/**
 * User Context and Ownership Detection Utilities
 *
 * Provides utilities for determining user permissions, item ownership,
 * and context-aware access control for card actions.
 */

import type {
  UserContext,
  ItemOwnership,
  RawApiItem,
  NormalizedCardData,
} from "@/types/normalized-cards";

/**
 * Determine item ownership and permissions based on user context
 */
export function determineItemOwnership(
  item: RawApiItem | NormalizedCardData,
  userContext?: UserContext,
): ItemOwnership {
  if (!userContext?.isAuthenticated) {
    return {
      ownership: "none",
      canEdit: false,
      canDelete: false,
      canManage: false,
      showOwnership: false,
    };
  }

  const itemUserId = item.userId;
  const itemAccountId = (item as RawApiItem & { accountId?: string }).accountId;
  const { userId, accountId, role } = userContext;

  // Direct ownership - user owns the item
  if (itemUserId === userId) {
    return {
      ownership: "owned",
      ownerId: userId,
      canEdit: true,
      canDelete: true,
      canManage: true,
      showOwnership: true,
    };
  }

  // Account ownership - item belongs to user's account
  if (itemAccountId && itemAccountId === accountId) {
    const canManage = role === "account_owner";
    const canEdit = role === "account_owner" || role === "recruiter";

    return {
      ownership: "account_owned",
      ownerId: itemUserId,
      accountId: itemAccountId,
      canEdit,
      canDelete: canManage,
      canManage,
      showOwnership: true,
    };
  }

  // Check if item is tracked by user
  const isTracked = checkIfTracked(item, userId);
  if (isTracked) {
    return {
      ownership: "tracked",
      canEdit: false,
      canDelete: false,
      canManage: false,
      showOwnership: true,
    };
  }

  // No ownership relationship
  return {
    ownership: "none",
    canEdit: false,
    canDelete: false,
    canManage: false,
    showOwnership: false,
  };
}

/**
 * Check if an item is tracked by the user
 * This would typically query a tracking service or check local state
 */
function checkIfTracked(
   
  _item: RawApiItem | NormalizedCardData,
   
  _userId: string,
): boolean {
  // TODO: Implement actual tracking check
  // This could check localStorage, a tracking service, or user preferences
  return false;
}

/**
 * Check if user has specific permission
 */
export function hasPermission(
  userContext: UserContext,
  permission: string,
): boolean {
  if (!userContext.isAuthenticated) {
    return false;
  }

  // Admin has all permissions
  if (userContext.role === "admin") {
    return true;
  }

  return userContext.permissions.includes(permission);
}

/**
 * Get user role display name
 */
export function getUserRoleDisplayName(role: UserContext["role"]): string {
  const roleNames = {
    admin: "Administrator",
    account_owner: "Account Owner",
    recruiter: "Recruiter",
    regular_user: "User",
  };

  return roleNames[role] || "User";
}

/**
 * Check if user can perform action on item
 */
export function canPerformAction(
  action: string,
  itemOwnership: ItemOwnership,
  userContext: UserContext,
): boolean {
  if (!userContext.isAuthenticated) {
    return false;
  }

  switch (action) {
    case "view":
      return true; // Everyone can view (visibility handled elsewhere)

    case "edit":
      return itemOwnership.canEdit;

    case "delete":
      return itemOwnership.canDelete;

    case "manage":
      return itemOwnership.canManage;

    case "track":
      return itemOwnership.ownership === "none";

    case "untrack":
      return itemOwnership.ownership === "tracked";

    case "assign":
      return (
        userContext.role === "account_owner" &&
        itemOwnership.ownership === "account_owned"
      );

    case "contact":
      return (
        userContext.role === "recruiter" || userContext.role === "account_owner"
      );

    case "review":
      return (
        userContext.role === "recruiter" || userContext.role === "account_owner"
      );

    default:
      return false;
  }
}

/**
 * Get default user context for unauthenticated users
 */
export function getDefaultUserContext(): UserContext {
  return {
    userId: "",
    role: "regular_user",
    permissions: [],
    isAuthenticated: false,
  };
}

/**
 * Create user context from auth data
 */
export function createUserContext(authData: {
  userId: string;
  role: string;
  accountId?: string;
  permissions?: string[];
}): UserContext {
  return {
    userId: authData.userId,
    role: authData.role as UserContext["role"],
    accountId: authData.accountId,
    permissions: authData.permissions || [],
    isAuthenticated: true,
  };
}
