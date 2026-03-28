import React, { useState } from "react";
import { Search, Filter, MoreHorizontal, UserCheck, UserX, Eye, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { useAdminPermissions } from "@/lib/admin-permissions";

const ROLE_COLORS: Record<string, string> = {
  SuperAdmin:  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Admin:       "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Employer:    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Recruiter:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  JobSeeker:   "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  Affiliate:   "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "suspended" | "pending";
  joined: string;
  lastLogin: string;
}

// Placeholder data — replace with real API call
const MOCK_USERS: User[] = [
  { id: "1", name: "Alice Johnson", email: "alice@example.com", role: "Employer", status: "active", joined: "2025-01-15", lastLogin: "2026-03-27" },
  { id: "2", name: "Bob Smith", email: "bob@example.com", role: "JobSeeker", status: "active", joined: "2025-03-01", lastLogin: "2026-03-28" },
  { id: "3", name: "Carol White", email: "carol@example.com", role: "Recruiter", status: "suspended", joined: "2024-11-20", lastLogin: "2026-02-10" },
  { id: "4", name: "David Lee", email: "david@example.com", role: "Admin", status: "active", joined: "2024-06-01", lastLogin: "2026-03-28" },
  { id: "5", name: "Eva Martinez", email: "eva@example.com", role: "Affiliate", status: "pending", joined: "2026-03-25", lastLogin: "2026-03-25" },
];

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-green-100 text-green-800",
  suspended: "bg-red-100 text-red-800",
  pending:   "bg-yellow-100 text-yellow-800",
};

export default function UserManagement() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const { startImpersonation } = useAuth();
  const { toast } = useToast();
  const { can } = useAdminPermissions();

  const canCreate    = can("users", "create");
  const canUpdate    = can("users", "update");
  const canDelete    = can("users", "delete");
  const canImpersonate = can("users", "delete"); // impersonate requires full access

  const filtered = MOCK_USERS.filter((u) => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  const handleImpersonate = async (user: User) => {
    try {
      await startImpersonation(user.id);
      toast({ title: `Impersonating ${user.name}` });
    } catch {
      toast({ title: "Failed to start impersonation", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground text-sm">View, edit, and manage all platform users.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{MOCK_USERS.length}</span> total users
          </span>
          {canCreate && (
            <Button size="sm">Invite User</Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active",    count: MOCK_USERS.filter(u => u.status === "active").length,    color: "text-green-600" },
          { label: "Suspended", count: MOCK_USERS.filter(u => u.status === "suspended").length, color: "text-red-600"   },
          { label: "Pending",   count: MOCK_USERS.filter(u => u.status === "pending").length,   color: "text-yellow-600"},
          { label: "Admins",    count: MOCK_USERS.filter(u => u.role === "Admin" || u.role === "SuperAdmin").length, color: "text-purple-600" },
        ].map(({ label, count, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="SuperAdmin">Super Admin</SelectItem>
            <SelectItem value="Admin">Admin</SelectItem>
            <SelectItem value="Employer">Employer</SelectItem>
            <SelectItem value="Recruiter">Recruiter</SelectItem>
            <SelectItem value="JobSeeker">Job Seeker</SelectItem>
            <SelectItem value="Affiliate">Affiliate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] ?? ""}`}>
                    {getRoleDisplayLabel(user.role)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[user.status]}`}>
                    {user.status}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{user.joined}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{user.lastLogin}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Eye className="h-4 w-4 mr-2" />View Profile
                      </DropdownMenuItem>
                      {canUpdate && (
                        <DropdownMenuItem>
                          <ShieldCheck className="h-4 w-4 mr-2" />Change Role
                        </DropdownMenuItem>
                      )}
                      {canImpersonate && (
                        <DropdownMenuItem onSelect={() => handleImpersonate(user)}>
                          <UserCheck className="h-4 w-4 mr-2" />Impersonate
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            <UserX className="h-4 w-4 mr-2" />
                            {user.status === "suspended" ? "Unsuspend" : "Suspend"}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No users match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
