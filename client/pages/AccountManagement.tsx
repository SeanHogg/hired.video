import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  UserPlus,
  Settings,
  Shield,
  Mail,
  MoreVertical,
  Crown,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  ArrowRight,
  Sparkles,
  BarChart3,
  Zap,
  Target,
  Network,
} from "lucide-react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { accountService } from "@/lib/services/account-service";
import {
  AccountUser,
  InviteStatus,
  MyVideoResumeRole,
  getRoleDisplayName,
  getInviteStatusDisplayName,
  getInviteStatusColor,
  canManageUsers,
  canEditRoles,
} from "@/types/account";
import { InviteUserModal } from "@/components/account/InviteUserModal";
import { BulkInviteModal } from "@/components/account/BulkInviteModal";
import { InvitationManagement } from "@/components/account/InvitationManagement";
import { InvitationAnalytics } from "@/components/account/InvitationAnalytics";
import { EditRolesModal } from "@/components/account/EditRolesModal";
import { AccountAnalytics } from "@/components/account/AccountAnalytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AccountManagement() {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AccountUser | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [bulkInviteModalOpen, setBulkInviteModalOpen] = useState(false);
  const [editRolesModalOpen, setEditRolesModalOpen] = useState(false);
  const { toast } = useToast();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Check if user is a job seeker (should see personal account page instead of team management)
  const isJobSeeker = user?.role === "job_seeker";
  const [activeTab, setActiveTab] = useState("users");

  // Mock current user roles for demo - in real app this would come from auth context
  const currentUserRoles = [MyVideoResumeRole.AccountOwner];

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
      loadAccountUsers(); // Refresh the list
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
      loadAccountUsers(); // Refresh the list
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

  const handleUpdateRoles = async (
    userId: string,
    roles: MyVideoResumeRole[],
  ) => {
    try {
      await accountService.updateUserRoles({ userId, roles });
      toast({
        title: "Success",
        description: "User roles updated successfully",
      });
      setEditRolesModalOpen(false);
      setSelectedUser(null);
      loadAccountUsers(); // Refresh the list
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

  const handleResendInvitation = async (userId: string) => {
    try {
      await accountService.resendInvitation(userId);
      toast({
        title: "Success",
        description: "Invitation resent successfully",
      });
      loadAccountUsers(); // Refresh the list
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to resend invitation";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (
      !confirm("Are you sure you want to remove this user from the account?")
    ) {
      return;
    }

    try {
      await accountService.removeUser(userId);
      toast({
        title: "Success",
        description: "User removed successfully",
      });
      loadAccountUsers(); // Refresh the list
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to remove user";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: InviteStatus) => {
    switch (status) {
      case InviteStatus.Owner:
        return <Crown className="h-4 w-4" />;
      case InviteStatus.Accepted:
        return <CheckCircle className="h-4 w-4" />;
      case InviteStatus.Invited:
        return <Clock className="h-4 w-4" />;
      case InviteStatus.Rejected:
        return <XCircle className="h-4 w-4" />;
      case InviteStatus.Expired:
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };



  const handleExportAnalytics = (format: "csv" | "pdf") => {
    // In a real app, this would generate and download the export
    toast({
      title: "Export started",
      description: `Analytics export in ${format.toUpperCase()} format will be ready shortly.`,
    });
  };

  const canManage = canManageUsers(currentUserRoles);

  // If auth is loading, show loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />

          <div className="pt-16">
            <div className="container mx-auto py-8">
              <div className="flex items-center justify-center h-64">
                <div className="text-center space-y-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              </div>
            </div>
          </div>

          <Footer />
        </div>
      </div>
    );
  }



  // Redirect job seekers to settings page instead of showing account management
  if (isAuthenticated && user && isJobSeeker) {
    window.location.href = '/settings';
    return null;
  }

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />

          <div className="pt-16">
            <div className="max-w-6xl mx-auto px-4 py-16">
              {/* Hero Section */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <Users className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    Account Management
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Manage Your Team and Organization
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Streamline your business operations with powerful account
                  management tools. Invite team members, assign roles, track
                  analytics, and manage permissions all from one centralized
                  dashboard.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      Start Managing Today
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-lg px-8"
                    >
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Features Grid */}
              <div className="grid md:grid-cols-3 gap-8 mb-16">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <UserPlus className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Team Management</CardTitle>
                    <CardDescription>
                      Invite team members, assign roles, and manage permissions
                      with granular access controls for your organization.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <BarChart3 className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Analytics Dashboard</CardTitle>
                    <CardDescription>
                      Track team performance, user engagement, and
                      organizational metrics with comprehensive analytics and
                      reporting.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Shield className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Security & Compliance</CardTitle>
                    <CardDescription>
                      Enterprise-grade security with role-based access control,
                      audit logs, and compliance features for your peace of
                      mind.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>

              {/* Benefits Section */}
              <div className="bg-white/50 rounded-2xl p-8 mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  Why Choose Our Account Management?
                </h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-purple/10 p-3 rounded-lg">
                      <Zap className="h-6 w-6 text-brand-purple" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">
                        Streamlined Operations
                      </h3>
                      <p className="text-muted-foreground">
                        Centralize all your team management tasks in one
                        intuitive dashboard for maximum efficiency.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-blue/10 p-3 rounded-lg">
                      <Target className="h-6 w-6 text-brand-blue" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Role-Based Access</h3>
                      <p className="text-muted-foreground">
                        Assign specific roles and permissions to ensure team
                        members have access to exactly what they need.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-purple/10 p-3 rounded-lg">
                      <Network className="h-6 w-6 text-brand-purple" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Scalable Growth</h3>
                      <p className="text-muted-foreground">
                        Built to grow with your organization, from small teams
                        to enterprise-level operations.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-blue/10 p-3 rounded-lg">
                      <BarChart3 className="h-6 w-6 text-brand-blue" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Real-Time Insights</h3>
                      <p className="text-muted-foreground">
                        Get actionable insights with real-time analytics and
                        comprehensive reporting tools.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* CTA Section */}
              <div className="text-center">
                <h2 className="text-3xl font-bold mb-6">
                  Ready to Transform Your Team Management?
                </h2>
                <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                  Join thousands of organizations already using our platform to
                  streamline their operations and boost productivity.
                </p>
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <Footer />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />

          <div className="pt-16">
            <div className="container mx-auto py-8">
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            </div>
          </div>

          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16">
          <div className="container mx-auto py-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Account Management
                </h1>
                <p className="text-gray-600 mt-2">
                  Manage your team members, invitations, and account analytics
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

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="users">Team Members</TabsTrigger>
                <TabsTrigger value="invitations">Invitation Analytics</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </TabsList>

              <TabsContent value="users" className="space-y-6">
                {/* Error State */}
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

                {/* Invitation Management */}
                <InvitationManagement
                  users={users}
                  onRefresh={loadAccountUsers}
                  onInviteUser={() => setInviteModalOpen(true)}
                  onBulkInvite={() => setBulkInviteModalOpen(true)}
                />

              </TabsContent>

              <TabsContent value="invitations" className="space-y-6">
                <InvitationAnalytics />
              </TabsContent>

              <TabsContent value="analytics">
                <AccountAnalytics
                  loading={loading}
                  onExport={handleExportAnalytics}
                  onLoadAnalytics={accountService.getAccountAnalytics}
                />
              </TabsContent>
            </Tabs>

            {/* Modals */}
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
        </div>

        <Footer />
      </div>
    </div>
  );
}
