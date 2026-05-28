import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  AlertCircle,
  CreditCard,
  FileText,
  UserCog,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth, USER_ROLES } from "@/lib/auth";

import { accountService } from "@/lib/services/account-service";
import { AccountUser } from "@/types/account";
import { InviteUserModal } from "@/components/account/InviteUserModal";
import { BulkInviteModal } from "@/components/account/BulkInviteModal";
import { InvitationManagement } from "@/components/account/InvitationManagement";
import { EditRolesModal } from "@/components/account/EditRolesModal";
import { AccountManagementSkeleton } from "@/components/account/AccountManagementSkeleton";
import { AccountHygienePanel } from "@/components/account/AccountHygienePanel";
import { BillingManagement } from "@/components/billing/BillingManagement";
import { UsageStatementPanel } from "@/components/billing/UsageStatementPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AccountManagementPanel() {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AccountUser | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [bulkInviteModalOpen, setBulkInviteModalOpen] = useState(false);
  const [editRolesModalOpen, setEditRolesModalOpen] = useState(false);

  const { toast } = useToast();
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const isJobSeeker = user?.role === USER_ROLES.JOB_SEEKER;
  const [activeTab, setActiveTab] = useState("billing");

  // Closes gap-register #781 — derived from auth, not hardcoded. SuperAdmin
  // gets the same role list as `admin` for invite/edit-roles dropdowns;
  // every other role flows through `getAvailableRolesForInvite` (which
  // returns `[]` for job_seeker so the Invite UI hides itself).
  const currentUserRoles = user?.role
    ? [user.role === USER_ROLES.SUPER_ADMIN ? "admin" : user.role]
    : [];

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      loadAccountUsers();
    }
  }, [isAuthenticated, authLoading]);

  const loadAccountUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const accountUsers = await accountService.getAccountUsers();
      setUsers(accountUsers);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t("errors.loadAccountUsersFailed");
      setError(errorMessage);
      toast({
        title: t("labels.error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async (inviteData: any) => {
    try {
      let result = await accountService.inviteUser(inviteData);
      // Seat soft-cap (#1678): the server declined to send because the invite
      // adds a paid seat past the authorized limit. Confirm the cost, then
      // re-send with explicit authorization.
      if (result.requiresSeatConfirmation) {
        const price = ((result.seatInfo?.pricePerSeatCents ?? 0) / 100).toFixed(2);
        const confirmed = window.confirm(
          `${result.message} This adds a seat at $${price}/mo to your bill. Add it?`,
        );
        if (!confirmed) {
          setInviteModalOpen(false);
          return;
        }
        result = await accountService.inviteUser({ ...inviteData, confirmPaidSeat: true });
      }
      toast({
        title: t("labels.success"),
        description: t("messages.userInvitedSuccess"),
      });
      setInviteModalOpen(false);
      loadAccountUsers();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t("errors.inviteUserFailed");
      toast({
        title: t("labels.error"),
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleBulkInvite = async (bulkData: any) => {
    try {
      const result = await accountService.bulkInviteUsers(bulkData);
      toast({
        title: t("messages.bulkInviteCompleteTitle"),
        description: t("messages.bulkInviteCompleteDesc", {
          success: result.successCount,
          failure: result.failureCount,
          total: result.totalProcessed,
        }),
      });
      setBulkInviteModalOpen(false);
      loadAccountUsers();
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t("errors.bulkInviteFailed");
      toast({
        title: t("labels.error"),
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdateRoles = async (userId: string, roles: string[]) => {
    try {
      await accountService.updateUserRoles({ userId, roles });
      toast({
        title: t("labels.success"),
        description: t("messages.userRolesUpdated"),
      });
      setEditRolesModalOpen(false);
      setSelectedUser(null);
      loadAccountUsers();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t("errors.updateRolesFailed");
      toast({
        title: t("labels.error"),
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  if (authLoading) {
    return <AccountManagementSkeleton />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const showInitialSkeleton = loading && users.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {t("headings.accountManagementPanel")}
        </h2>
        <p className="text-muted-foreground mt-1">
          {isJobSeeker
            ? t("messages.accountPanelDescJobSeeker")
            : t("messages.accountPanelDescTeam")}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
        <div className="w-full overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
          <TabsList className={`inline-flex sm:grid w-auto sm:w-full ${isJobSeeker ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} gap-1 min-w-max sm:min-w-0`}>
            <TabsTrigger
              value="billing"
              className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3"
            >
              <CreditCard className="h-4 w-4" />
              <span>{t("tabs.billing")}</span>
            </TabsTrigger>
            <TabsTrigger
              value="usage-statement"
              className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3"
            >
              <FileText className="h-4 w-4" />
              <span>{t("tabs.accountUsageStatement")}</span>
            </TabsTrigger>
            <TabsTrigger
              value="account"
              className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3"
            >
              <UserCog className="h-4 w-4" />
              <span>{t("tabs.accountHygiene")}</span>
            </TabsTrigger>
            {!isJobSeeker && (
              <TabsTrigger
                value="users"
                className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3"
              >
                <Users className="h-4 w-4" />
                <span>{t("tabs.teamMembers")}</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="billing" className="space-y-6">
          {activeTab === "billing" && <BillingManagement />}
        </TabsContent>

        <TabsContent value="usage-statement" className="space-y-6">
          {activeTab === "usage-statement" && <UsageStatementPanel />}
        </TabsContent>

        <TabsContent value="account" className="space-y-6">
          {activeTab === "account" && <AccountHygienePanel />}
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          {showInitialSkeleton ? (
            <AccountManagementSkeleton showTabs={false} />
          ) : (
            <>
              {error && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertCircle className="h-5 w-5" />
                      <span>{error}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <InvitationManagement
                users={users}
                onRefresh={loadAccountUsers}
                onInviteUser={() => setInviteModalOpen(true)}
                onBulkInvite={() => setBulkInviteModalOpen(true)}
                onEditRoles={(u) => {
                  setSelectedUser(u);
                  setEditRolesModalOpen(true);
                }}
              />
            </>
          )}
        </TabsContent>

      </Tabs>

      <InviteUserModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        onInvite={handleInviteUser}
        currentUserRoles={currentUserRoles}
      />

      <BulkInviteModal
        open={bulkInviteModalOpen}
        onOpenChange={setBulkInviteModalOpen}
        onBulkInvite={handleBulkInvite}
        currentUserRoles={currentUserRoles}
      />

      {selectedUser && (
        <EditRolesModal
          open={editRolesModalOpen}
          onOpenChange={setEditRolesModalOpen}
          user={selectedUser}
          onUpdateRoles={handleUpdateRoles}
          currentUserRoles={currentUserRoles}
        />
      )}
    </div>
  );
}
