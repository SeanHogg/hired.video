import React, { useState } from "react";
import {
  Users,
  UserPlus,
  MoreHorizontal,
  Search,
  Upload,
  RefreshCw,
  X,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Crown,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AccountUser,
  InviteStatus,
  getInviteStatusDisplayName,
  getInviteStatusColor,
  getRoleDisplayName,
} from "@/types/account";
import { accountService } from "@/lib/services/account-service";
import { toast } from "@/hooks/use-toast";

interface InvitationManagementProps {
  users: AccountUser[];
  onRefresh: () => void;
  onInviteUser: () => void;
  onBulkInvite: () => void;
}

export function InvitationManagement({
  users,
  onRefresh,
  onInviteUser,
  onBulkInvite,
}: InvitationManagementProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Filter users based on search and filters
  const filteredUsers = users.filter((user) => {
    const firstName = user.firstName?.toLowerCase() ?? "";
    const lastName = user.lastName?.toLowerCase() ?? "";
    const email = user.email?.toLowerCase() ?? "";

    const term = searchTerm.toLowerCase();
    const matchesSearch =
      firstName.includes(term) ||
      lastName.includes(term) ||
      email.includes(term);

    const matchesStatus =
      statusFilter === "all" ||
      getInviteStatusDisplayName(user.inviteStatus).toLowerCase() ===
        statusFilter.toLowerCase();

    const matchesRole =
      roleFilter === "all" ||
      (user.rolesAssigned?.some(
        (role) =>
          getRoleDisplayName(role).toLowerCase() === roleFilter.toLowerCase(),
      ) ??
        false);

    return matchesSearch && matchesStatus && matchesRole;
  });

  const getStatusIcon = (status: InviteStatus) => {
    switch (status) {
      case InviteStatus.Owner:
        return <Crown className="h-4 w-4" />;
      case InviteStatus.Accepted:
        return <CheckCircle className="h-4 w-4" />;
      case InviteStatus.Invited:
      case InviteStatus.Resent:
        return <Clock className="h-4 w-4" />;
      case InviteStatus.Rejected:
        return <XCircle className="h-4 w-4" />;
      case InviteStatus.Expired:
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const handleResendInvitation = async (userId: string) => {
    try {
      setLoading(true);
      await accountService.resendInvitation(userId);
      toast({
        title: "Success",
        description: "Invitation resent successfully",
      });
      onRefresh();
    } catch {
      toast({
        title: "Error",
        description: "Failed to resend invitation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelInvitation = async (userId: string) => {
    try {
      setLoading(true);
      await accountService.cancelInvitation(userId);
      toast({
        title: "Success",
        description: "Invitation canceled successfully",
      });
      onRefresh();
    } catch {
      toast({
        title: "Error",
        description: "Failed to cancel invitation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canManageInvitation = (status: InviteStatus) => {
    return (
      status === InviteStatus.Invited ||
      status === InviteStatus.Resent ||
      status === InviteStatus.Expired
    );
  };

  const getActionMenuItems = (user: AccountUser) => {
    const items = [];

    // Only show actions for users that can be managed (not owners)
    if (user.canDelete && canManageInvitation(user.inviteStatus)) {
      items.push(
        <DropdownMenuItem
          key="resend"
          onClick={() => handleResendInvitation(user.id)}
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Resend Invitation
        </DropdownMenuItem>,
      );

      items.push(
        <DropdownMenuItem
          key="cancel"
          onClick={() => handleCancelInvitation(user.id)}
          disabled={loading}
          className="text-red-600"
        >
          <X className="h-4 w-4 mr-2" />
          Cancel Invitation
        </DropdownMenuItem>,
      );
    }

    // Show role editing for users that can have roles edited
    if (user.canEditRoles) {
      items.push(
        <DropdownMenuItem
          key="edit-roles"
          onClick={() => {
            /* TODO: Implement role editing */
          }}
          disabled={loading}
        >
          <Settings className="h-4 w-4 mr-2" />
          Edit Roles
        </DropdownMenuItem>,
      );
    }

    return items;
  };

  const getStatusCounts = () => {
    const counts = {
      total: users.length,
      invited: users.filter(
        (u) =>
          u.inviteStatus === InviteStatus.Invited ||
          u.inviteStatus === InviteStatus.Resent,
      ).length,
      accepted: users.filter(
        (u) =>
          u.inviteStatus === InviteStatus.Accepted ||
          u.inviteStatus === InviteStatus.Owner,
      ).length,
      expired: users.filter((u) => u.inviteStatus === InviteStatus.Expired)
        .length,
      rejected: users.filter((u) => u.inviteStatus === InviteStatus.Rejected)
        .length,
    };
    return counts;
  };

  const statusCounts = getStatusCounts();

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Users</p>
                <p className="text-2xl font-bold">{statusCounts.total}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Active Members
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {statusCounts.accepted}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Pending Invites
                </p>
                <p className="text-2xl font-bold text-yellow-600">
                  {statusCounts.invited}
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Expired</p>
                <p className="text-2xl font-bold text-red-600">
                  {statusCounts.expired}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions and Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members & Invitations
              </CardTitle>
              <CardDescription>
                Manage your team members and pending invitations
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={onInviteUser} size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Invite User
              </Button>
              <Button onClick={onBulkInvite} variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Bulk Invite
              </Button>
              <Button
                onClick={onRefresh}
                variant="outline"
                size="sm"
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="accountowner">Account Owner</SelectItem>
                <SelectItem value="accountadmin">Account Admin</SelectItem>
                <SelectItem value="employer">Employer</SelectItem>
                <SelectItem value="recruiter">Recruiter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Users Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-gray-500"
                    >
                      No users found matching your criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-600">
                              {user.firstName?.charAt(0) || "U"}
                              {user.lastName?.charAt(0) || "U"}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">
                              {user.firstName || "Unknown"}{" "}
                              {user.lastName || "User"}
                            </p>
                            <p className="text-sm text-gray-500">
                              {user.email || "No email"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`${getInviteStatusColor(user.inviteStatus)} flex items-center gap-1 w-fit`}
                        >
                          {getStatusIcon(user.inviteStatus)}
                          {getInviteStatusDisplayName(user.inviteStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(user.rolesAssigned || []).map((role) => (
                            <Badge
                              key={role}
                              variant="outline"
                              className="text-xs"
                            >
                              {getRoleDisplayName(role)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-500">
                          {user.inviteStatusStartDateTime
                            ? new Date(
                                user.inviteStatusStartDateTime,
                              ).toLocaleDateString()
                            : "Pending"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {getActionMenuItems(user).length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {getActionMenuItems(user)}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
