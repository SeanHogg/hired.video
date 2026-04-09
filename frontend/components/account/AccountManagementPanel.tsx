import React, { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  Mail,
  AlertCircle,
  BarChart3,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth, USER_ROLES } from "@/lib/auth";

import { accountService } from "@/lib/services/account-service";
import {
  AccountUser,
  canManageUsers,
} from "@/types/account";
import { InviteUserModal } from "@/components/account/InviteUserModal";
import { BulkInviteModal } from "@/components/account/BulkInviteModal";
import { InvitationManagement } from "@/components/account/InvitationManagement";
import { InvitationAnalytics } from "@/components/account/InvitationAnalytics";
import { EditRolesModal } from "@/components/account/EditRolesModal";
import { AccountAnalytics } from "@/components/account/AccountAnalytics";
import { AccountManagementSkeleton } from "@/components/account/AccountManagementSkeleton";
import { BillingManagement } from "@/components/billing/BillingManagement";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AccountManagementPanel() {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AccountUser | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [bulkInviteModalOpen, setBulkInviteModalOpen] = useState(false);
  const [editRolesModalOpen, setEditRolesModalOpen] = useState(false);

  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({
    billing: false,
    users: false,
    invitations: false,
    analytics: false,
  });

  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const isJobSeeker = user?.role === USER_ROLES.JOB_SEEKER;
  const [activeTab, setActiveTab] = useState("billing");

  // Mock current user roles for demo - in real app this would come from auth context
  const currentUserRoles = ["Admin"];

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      loadAccountUsers();
    }
  }, [isAuthenticated, authLoading]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setTabLoading((prev) => ({ ...prev, [value]: true }));
    setTimeout(() => {
      setTabLoading((prev) => ({ ...prev, [value]: false }));
    }, 300);
  };

  const loadAccountUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const accountUsers = await accountService.getAccountUsers();
      setUsers(accountUsers);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load account users";
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async (inviteData: any) => {
    try {
      await accountService.inviteUser(inviteData);
      toast({
        title: "Success",
        description: "User invitation sent successfully",
      });
      setInviteModalOpen(false);
      loadAccountUsers();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to invite user";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleBulkInvite = async (bulkData: any) => {
    try {
      const result = await accountService.bulkInviteUsers(bulkData);
      toast({
        title: "Bulk Invitation Complete",
        description: `${result.successCount} successful, ${result.failureCount} failed out of ${result.totalProcessed} total`,
      });
      setBulkInviteModalOpen(false);
      loadAccountUsers();
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to send bulk invitations";
      toast({
        title: "Error",
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
        title: "Success",
        description: "User roles updated successfully",
      });
      setEditRolesModalOpen(false);
      setSelectedUser(null);
      loadAccountUsers();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update user roles";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleExportAnalytics = (format: "csv" | "pdf") => {
    toast({
      title: "Export started",
      description: `Analytics export in ${format.toUpperCase()} format will be ready shortly.`,
    });
  };

  const canManage = canManageUsers(currentUserRoles);

  if (authLoading) {
    return <AccountManagementSkeleton />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const showInitialSkeleton = loading && users.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Account Management
          </h2>
          <p className="text-muted-foreground mt-1">
            {isJobSeeker
              ? "Manage your billing, subscription, and account settings"
              : "Manage your team members, billing, invitations, and account analytics"}
          </p>
        </div>
        {canManage && activeTab === "users" && (
          <Button
            onClick={() => setInviteModalOpen(true)}
            className="flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" />
            Invite User
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4 sm:space-y-6">
        <div className="w-full overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
          <TabsList className={`inline-flex sm:grid w-auto sm:w-full ${isJobSeeker ? 'sm:grid-cols-1' : 'sm:grid-cols-4'} gap-1 min-w-max sm:min-w-0`}>
            <TabsTrigger
              value="billing"
              className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3"
            >
              <CreditCard className="h-4 w-4" />
              <span>Billing & Subscription</span>
            </TabsTrigger>
            {!isJobSeeker && (
              <>
                <TabsTrigger
                  value="users"
                  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3"
                >
                  <Users className="h-4 w-4" />
                  <span>Team Members</span>
                </TabsTrigger>
                <TabsTrigger
                  value="invitations"
                  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3"
                >
                  <Mail className="h-4 w-4" />
                  <span>Invitation Analytics</span>
                </TabsTrigger>
                <TabsTrigger
                  value="analytics"
                  className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Analytics</span>
                </TabsTrigger>
              </>
            )}
          </TabsList>
        </div>

        <TabsContent value="billing" className="space-y-6">
          {activeTab === "billing" && <BillingManagement />}
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
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="invitations" className="space-y-6">
          {tabLoading.invitations ? (
            <AccountManagementSkeleton showTabs={false} />
          ) : (
            <InvitationAnalytics />
          )}
        </TabsContent>

        <TabsContent value="analytics">
          {tabLoading.analytics ? (
            <AccountManagementSkeleton showTabs={false} />
          ) : (
            <AccountAnalytics
              loading={loading}
              onExport={handleExportAnalytics}
              onLoadAnalytics={accountService.getAccountAnalytics}
            />
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
