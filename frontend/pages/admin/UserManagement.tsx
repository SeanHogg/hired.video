import { publicProfilePath } from "@shared/public-paths";
import { useState } from "react";
import { useIdSelection } from "@/hooks/use-id-selection";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ReferralGroups } from "@/components/admin/ReferralGroups";
import { ToolHistorySheet } from "@/components/ToolHistorySheet";
import { UserHistorySheet } from "@/components/admin/UserHistorySheet";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { isBulkSelectable, isUserActive } from "@/components/admin/user-management/helpers";
import type {
  ApiUser,
  UserManagementPermissions,
  UserRowHandlers,
} from "@/components/admin/user-management/types";
import { useUserList } from "@/components/admin/user-management/use-user-list";
import { useUserActions } from "@/components/admin/user-management/use-user-actions";
import { useTokenGrant } from "@/components/admin/user-management/use-token-grant";
import { usePlanOverride } from "@/components/admin/user-management/use-plan-override";
import { useBulkUserActions } from "@/components/admin/user-management/use-bulk-user-actions";
import { UserSummaryCards } from "@/components/admin/user-management/UserSummaryCards";
import { UserViewToggle, UserFilters } from "@/components/admin/user-management/UserListToolbar";
import { BulkActionBar } from "@/components/admin/user-management/BulkActionBar";
import { UserTable } from "@/components/admin/user-management/UserTable";
import { GrantTokensDialog } from "@/components/admin/user-management/GrantTokensDialog";
import { PlanOverrideDialog } from "@/components/admin/user-management/PlanOverrideDialog";
import { BulkConfirmDialog } from "@/components/admin/user-management/BulkConfirmDialog";

export default function UserManagement() {
  const { t } = useTranslation();
  const list = useUserList();
  const { users, total, page, setPage, limit, stats, viewMode } = list;
  const { user: currentUser, isSuperAdmin } = useAuth();
  const { format: formatTz } = useUserTimezone();
  const { can } = useAdminPermissions();
  const navigate = useNavigate();

  // Bulk selection — ids picked via the row checkboxes. Cleared whenever
  // paginating or filtering replaces the users on screen, so a bulk action
  // never acts on rows the admin can no longer see.
  const selection = useIdSelection([page, list.search, list.roleFilter, list.statusFilter, list.editorialFilter, list.referredFilter]);
  const bulk = useBulkUserActions(selection, list.refresh);
  const actions = useUserActions(list.refresh);
  const grant = useTokenGrant(list.refresh);
  const override = usePlanOverride(list.refresh);
  const [toolHistoryTarget, setToolHistoryTarget] = useState<ApiUser | null>(null);
  // userId currently displayed in the auth-history sheet, or null when closed.
  const [historyUserId, setHistoryUserId] = useState<string | null>(null);

  const canUpdate = can("users", "update");
  const permissions: UserManagementPermissions = {
    canCreate: can("users", "create"),
    canUpdate,
    canDelete: can("users", "delete"),
    canImpersonate: can("users", "delete"),
    canManageTokens: canUpdate,
    isSuperAdmin,
  };
  const { canCreate, canDelete } = permissions;

  const handlers: UserRowHandlers = {
    onViewProfile: (user) => navigate(publicProfilePath(user.id)),
    onViewHistory: (user) => setHistoryUserId(user.id),
    onViewToolHistory: (user) => setToolHistoryTarget(user),
    onChangeRole: actions.handleChangeRole,
    onImpersonate: actions.handleImpersonate,
    onSendPasswordReset: actions.handleSendPasswordReset,
    onToggleSystem: actions.handleToggleSystem,
    onHealResumes: actions.handleHealResumes,
    onGrantTokens: grant.openGrant,
    onResetTokens: actions.handleResetTokens,
    onOpenOverride: override.openOverride,
    onClearOverride: actions.handleClearOverride,
    onToggleStatus: actions.handleToggleStatus,
  };

  // Super-admins can't be bulk-targeted (the server rejects them too, but
  // we hide the checkbox to keep the UI honest about what's selectable).
  const selectableIds = users.filter(u => isBulkSelectable(u, currentUser?.id)).map(u => u.id);

  // Cards prefer the global stats endpoint when available so they
  // reflect the whole DB, not the visible page. Fall back to
  // page-derived counts during the first paint / on stats failure so
  // the cards aren't empty.
  const activeCount = stats?.active ?? users.filter(isUserActive).length;
  const suspendedCount = stats?.suspended ?? users.filter(u => u.isSuspended).length;
  const inactiveCount = stats?.inactive ?? Math.max(0, total - activeCount - suspendedCount);
  const adminCount = stats?.admins ?? users.filter(u => u.role === "admin" || u.isSuperAdmin).length;
  const referredCount = stats?.referred ?? users.filter(u => u.referral).length;
  const totalUsersDisplay = stats?.total ?? total;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("headings.userManagementHeading")}</h1>
          <p className="text-muted-foreground text-sm">{t("messages.userManagementIntro")}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{totalUsersDisplay}</span> {t("labels.totalUsersCount", { count: totalUsersDisplay }).split(" ").slice(1).join(" ")}
          </span>
          {canCreate && (
            <Button size="sm">{t("actions.inviteUser")}</Button>
          )}
        </div>
      </div>

      <UserSummaryCards
        activeCount={activeCount}
        suspendedCount={suspendedCount}
        inactiveCount={inactiveCount}
        adminCount={adminCount}
        referredCount={referredCount}
      />

      {isSuperAdmin && <UserViewToggle viewMode={viewMode} onChange={list.setViewMode} />}

      {viewMode === "grouped" && <ReferralGroups />}

      {viewMode === "list" && (
        <UserFilters
          searchInput={list.searchInput}
          onSearchInputChange={list.setSearchInput}
          roleFilter={list.roleFilter}
          onRoleFilterChange={list.changeRoleFilter}
          statusFilter={list.statusFilter}
          onStatusFilterChange={list.changeStatusFilter}
          editorialFilter={list.editorialFilter}
          onToggleEditorial={list.toggleEditorialFilter}
          referredFilter={list.referredFilter}
          onToggleReferred={list.toggleReferredFilter}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {selection.size > 0 && canDelete && (
        <BulkActionBar
          selectedCount={selection.size}
          pendingBulk={bulk.pendingBulk}
          onSuspend={() => bulk.runBulkAction("suspend")}
          onConfirm={bulk.setBulkConfirm}
          onClear={() => selection.clear()}
        />
      )}

      {/* Error */}
      {viewMode === "list" && list.error && (
        <div className="text-center text-destructive py-4">
          {list.error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={list.loadUsers}>{t("actions.retry")}</Button>
        </div>
      )}

      {viewMode === "list" && (
        <UserTable
          users={users}
          loading={list.loading}
          currentUserId={currentUser?.id}
          selection={selection}
          selectableIds={selectableIds}
          permissions={permissions}
          handlers={handlers}
          healingUserId={actions.healingUserId}
          formatDate={formatTz}
        />
      )}

      <GrantTokensDialog
        target={grant.grantTarget}
        tokens={grant.grantTokens}
        onTokensChange={grant.setGrantTokens}
        reason={grant.grantReason}
        onReasonChange={grant.setGrantReason}
        granting={grant.granting}
        onClose={grant.closeGrant}
        onSubmit={grant.submitGrant}
      />

      <PlanOverrideDialog
        target={override.overrideTarget}
        plan={override.overridePlan}
        onPlanChange={override.setOverridePlan}
        tokenMode={override.overrideTokenMode}
        onTokenModeChange={override.setOverrideTokenMode}
        tokenCustom={override.overrideTokenCustom}
        onTokenCustomChange={override.setOverrideTokenCustom}
        expires={override.overrideExpires}
        onExpiresChange={override.setOverrideExpires}
        reason={override.overrideReason}
        onReasonChange={override.setOverrideReason}
        saving={override.savingOverride}
        onClose={override.closeOverride}
        onSubmit={override.submitOverride}
      />

      <BulkConfirmDialog
        action={bulk.bulkConfirm}
        selectedCount={selection.size}
        pendingBulk={bulk.pendingBulk}
        onClose={() => bulk.setBulkConfirm(null)}
        onConfirm={bulk.runBulkAction}
      />

      {/* Per-user tool-run history slide-out */}
      {toolHistoryTarget && (
        <ToolHistorySheet
          open
          onOpenChange={(open) => !open && setToolHistoryTarget(null)}
          source={{ kind: "user", userId: toolHistoryTarget.id }}
          entityName={toolHistoryTarget.name || toolHistoryTarget.email}
        />
      )}

      {/* Pagination */}
      {viewMode === "list" && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("labels.pageOfWithUsers", { page, totalPages, total })}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              {t("actions.previous")}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              {t("actions.next")}
            </Button>
          </div>
        </div>
      )}

      <UserHistorySheet
        userId={historyUserId}
        onOpenChange={(open) => { if (!open) setHistoryUserId(null); }}
      />
    </div>
  );
}
