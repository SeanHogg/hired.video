import React, { useState, useEffect, useCallback } from "react";
import { Search, Filter, MoreHorizontal, UserCheck, UserX, Eye, ShieldCheck, Loader2 } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { apiClient } from "@/lib/api-client";

const ROLE_COLORS: Record<string, string> = {
  SuperAdmin:  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Admin:       "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Employer:    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Recruiter:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  JobSeeker:   "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  job_seeker:  "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  Affiliate:   "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isSuspended: boolean;
  isSuperAdmin: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-green-100 text-green-800",
  suspended: "bg-red-100 text-red-800",
  inactive:  "bg-yellow-100 text-yellow-800",
};

function getUserStatus(u: ApiUser): string {
  if (u.isSuspended) return "suspended";
  if (u.isActive) return "active";
  return "inactive";
}

export default function UserManagement() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { startImpersonation } = useAuth();
  const { toast } = useToast();
  const { can } = useAdminPermissions();

  const canCreate    = can("users", "create");
  const canUpdate    = can("users", "update");
  const canDelete    = can("users", "delete");
  const canImpersonate = can("users", "delete");

  const limit = 50;

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (search) params.set("search", search);
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await apiClient.get<{ users: ApiUser[]; total: number; page: number; limit: number }>(
        `/api/admin/impersonate/users?${params.toString()}`
      );
      setUsers(res.data.users);
      setTotal(res.data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleImpersonate = async (user: ApiUser) => {
    try {
      await startImpersonation(user.id, "Admin user management");
      toast({ title: `Impersonating ${user.name}` });
    } catch {
      toast({ title: "Failed to start impersonation", variant: "destructive" });
    }
  };

  const handleChangeRole = async (user: ApiUser, newRole: string) => {
    try {
      await apiClient.put(`/api/admin/impersonate/users/${user.id}/role`, { role: newRole });
      toast({ title: `Changed ${user.name}'s role to ${getRoleDisplayLabel(newRole)}` });
      loadUsers();
    } catch {
      toast({ title: "Failed to change role", variant: "destructive" });
    }
  };

  const handleToggleStatus = async (user: ApiUser) => {
    const newStatus = user.isSuspended ? "active" : "suspended";
    try {
      await apiClient.put(`/api/admin/impersonate/users/${user.id}/status`, { status: newStatus });
      toast({ title: `${user.name} ${newStatus === "suspended" ? "suspended" : "unsuspended"}` });
      loadUsers();
    } catch {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };

  const activeCount = users.filter(u => u.isActive && !u.isSuspended).length;
  const suspendedCount = users.filter(u => u.isSuspended).length;
  const adminCount = users.filter(u => u.role === "Admin" || u.isSuperAdmin).length;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground text-sm">View, edit, and manage all platform users.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{total}</span> total users
          </span>
          {canCreate && (
            <Button size="sm">Invite User</Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active",    count: activeCount,    color: "text-green-600" },
          { label: "Suspended", count: suspendedCount, color: "text-red-600"   },
          { label: "Inactive",  count: total - activeCount - suspendedCount, color: "text-yellow-600"},
          { label: "Admins",    count: adminCount, color: "text-purple-600" },
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
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
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="text-center text-destructive py-4">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={loadUsers}>Retry</Button>
        </div>
      )}

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
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  Loading users...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No users match your filters.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const status = getUserStatus(user);
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] ?? ""}`}>
                        {user.isSuperAdmin ? "Super Admin" : getRoleDisplayLabel(user.role)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[status]}`}>
                        {status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "—"}
                    </TableCell>
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
                            <DropdownMenu>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <ShieldCheck className="h-4 w-4 mr-2" />Change Role
                              </DropdownMenuItem>
                            </DropdownMenu>
                          )}
                          {canUpdate && (
                            <>
                              {["JobSeeker", "Employer", "Recruiter", "Admin", "Affiliate"].filter(r => r !== user.role).map(r => (
                                <DropdownMenuItem key={r} className="pl-8 text-xs" onSelect={() => handleChangeRole(user, r)}>
                                  Set {getRoleDisplayLabel(r)}
                                </DropdownMenuItem>
                              ))}
                            </>
                          )}
                          {canImpersonate && (
                            <DropdownMenuItem onSelect={() => handleImpersonate(user)}>
                              <UserCheck className="h-4 w-4 mr-2" />Impersonate
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onSelect={() => handleToggleStatus(user)}>
                                <UserX className="h-4 w-4 mr-2" />
                                {user.isSuspended ? "Unsuspend" : "Suspend"}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} users)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
