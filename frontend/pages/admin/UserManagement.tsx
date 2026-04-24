import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, MoreHorizontal, UserCheck, UserX, Eye, ShieldCheck, Loader2, Coins, RotateCcw, KeyRound, Wrench, Sparkles, Undo2, FileText, Stethoscope, Trash2, Ban, X } from "lucide-react";
import { ToolHistorySheet } from "@/components/ToolHistorySheet";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/use-toast";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { apiClient } from "@/lib/api-client";
import {
  setPlanOverride,
  clearPlanOverride,
  type OverridablePlanSlug,
} from "@/lib/services/superadmin-plan-override-service";

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  admin:       "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  employer:    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  recruiter:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  job_seeker:  "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

interface PlanOverrideInfo {
  active: boolean;
  planSlug: string | null;
  monthlyTokenLimit: number | null;
  expiresAt: string | null;
  reason: string;
  grantedBy: string;
  grantedAt: string;
  originalPlanSlug: string;
  originalPlanName: string;
}

interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isSuspended: boolean;
  isBanned: boolean;
  isSuperAdmin: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  planId: string;
  planName: string;
  isPaid: boolean;
  isUnlimited: boolean;
  monthlyLimit: number | null;
  monthlyUsed: number;
  packBalance: number;
  tokensAvailable: number | null;
  toolRunCount: number;
  toolTokensUsed: number;
  resumeCount: number;
  planOverride: PlanOverrideInfo | null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-green-100 text-green-800",
  suspended: "bg-red-100 text-red-800",
  banned:    "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-200",
  inactive:  "bg-yellow-100 text-yellow-800",
};

function getUserStatus(u: ApiUser): string {
  if (u.isBanned) return "banned";
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
  const { user: currentUser, startImpersonation } = useAuth();
  const { format: formatTz } = useUserTimezone();
  const { toast } = useToast();
  const { can } = useAdminPermissions();
  const navigate = useNavigate();

  // Bulk selection — ids picked via the row checkboxes. A Set (rather than
  // array) so toggle/membership are O(1) as the page grows. Scoped to the
  // *current page's* users so that paginating or filtering clears the
  // selection — acting on users no longer on screen would be surprising.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBulk, setPendingBulk] = useState<null | "ban" | "suspend" | "delete">(null);
  const [bulkConfirm, setBulkConfirm] = useState<null | "ban" | "delete">(null);

  const [grantTarget, setGrantTarget] = useState<ApiUser | null>(null);
  const [grantTokens, setGrantTokens] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [granting, setGranting] = useState(false);
  const [toolHistoryTarget, setToolHistoryTarget] = useState<ApiUser | null>(null);

  // Plan-override dialog — SuperAdmin comp / trial / custom token limit.
  const [overrideTarget, setOverrideTarget] = useState<ApiUser | null>(null);
  const [overridePlan, setOverridePlan] = useState<OverridablePlanSlug | "keep">("pro");
  const [overrideTokenMode, setOverrideTokenMode] = useState<"default" | "custom" | "unlimited">("default");
  const [overrideTokenCustom, setOverrideTokenCustom] = useState("");
  const [overrideExpires, setOverrideExpires] = useState(""); // yyyy-mm-dd
  const [overrideReason, setOverrideReason] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  const canCreate    = can("users", "create");
  const canUpdate    = can("users", "update");
  const canDelete    = can("users", "delete");
  const canImpersonate = can("users", "delete");
  const canManageTokens = canUpdate;

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

  // Clear selection whenever the visible set changes — paginating or
  // filtering replaces the users on screen, and a lingering selection from
  // the previous view would act on rows the admin can no longer see.
  useEffect(() => { setSelectedIds(new Set()); }, [page, search, roleFilter, statusFilter]);

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

  const handleSendPasswordReset = async (user: ApiUser) => {
    if (!window.confirm(`Send a password reset email to ${user.name} (${user.email})?`)) return;
    try {
      await apiClient.post(`/api/admin/impersonate/users/${user.id}/password-reset`, {});
      toast({ title: `Password reset email sent to ${user.email}` });
    } catch {
      toast({ title: "Failed to send password reset", variant: "destructive" });
    }
  };

  const [healingUserId, setHealingUserId] = useState<string | null>(null);

  const handleHealResumes = async (user: ApiUser) => {
    if (user.resumeCount === 0) return;
    if (!window.confirm(
      `Run heal-and-validate on all ${user.resumeCount} of ${user.name}'s resumes? ` +
      `Content blobs that fail the shared schema will be transformed into a valid shape (null arrays → []; PascalCase → camelCase; missing sections filled) and written back to the DB. Rows already canonical are skipped.`
    )) return;
    try {
      setHealingUserId(user.id);
      const res = await apiClient.post<{
        total: number;
        healed: number;
        clean: number;
        failed: number;
        failures: Array<{ resumeId: string; title: string; issues: Array<{ path: string; message: string }> }>;
      }>(`/api/admin/impersonate/users/${user.id}/resumes/heal`, {});
      const { total, healed, clean, failed, failures } = res.data;
      toast({
        title: `Heal complete for ${user.name}`,
        description:
          `${healed} fixed, ${clean} already clean, ${failed} unrecoverable (of ${total} total).` +
          (failed > 0 ? ` See console for per-resume issues.` : ""),
      });
      if (failed > 0) console.warn("[admin] resume heal failures:", failures);
      loadUsers();
    } catch (err) {
      toast({
        title: "Heal failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setHealingUserId(null);
    }
  };

  const handleResetTokens = async (user: ApiUser) => {
    if (!window.confirm(`Reset ${user.name}'s monthly token usage to 0? This deletes their usage records for the current month.`)) return;
    try {
      const res = await apiClient.post<{ tokensReset: number }>(
        `/api/admin/impersonate/users/${user.id}/tokens/reset`,
        {},
      );
      toast({ title: `Reset ${res.data.tokensReset.toLocaleString()} tokens for ${user.name}` });
      loadUsers();
    } catch {
      toast({ title: "Failed to reset tokens", variant: "destructive" });
    }
  };

  const handleOpenGrant = (user: ApiUser) => {
    setGrantTarget(user);
    setGrantTokens("");
    setGrantReason("");
  };

  const handleSubmitGrant = async () => {
    if (!grantTarget) return;
    const tokens = Number(grantTokens);
    if (!Number.isInteger(tokens) || tokens <= 0) {
      toast({ title: "Enter a positive integer", variant: "destructive" });
      return;
    }
    try {
      setGranting(true);
      await apiClient.post(
        `/api/admin/impersonate/users/${grantTarget.id}/tokens/grant`,
        { tokens, reason: grantReason || undefined },
      );
      toast({ title: `Granted ${tokens.toLocaleString()} tokens to ${grantTarget.name}` });
      setGrantTarget(null);
      loadUsers();
    } catch {
      toast({ title: "Failed to grant tokens", variant: "destructive" });
    } finally {
      setGranting(false);
    }
  };

  const handleOpenOverride = (user: ApiUser) => {
    setOverrideTarget(user);
    // Pre-fill from the existing override if one is active, otherwise default
    // to "promote to Pro" which is the most common comp action.
    const existing = user.planOverride;
    if (existing?.active) {
      setOverridePlan((existing.planSlug as OverridablePlanSlug) ?? "keep");
      if (existing.monthlyTokenLimit === null) {
        setOverrideTokenMode("default");
        setOverrideTokenCustom("");
      } else if (existing.monthlyTokenLimit === -1) {
        setOverrideTokenMode("unlimited");
        setOverrideTokenCustom("");
      } else {
        setOverrideTokenMode("custom");
        setOverrideTokenCustom(String(existing.monthlyTokenLimit));
      }
      setOverrideExpires(existing.expiresAt ? existing.expiresAt.slice(0, 10) : "");
      setOverrideReason(existing.reason);
    } else {
      setOverridePlan("pro");
      setOverrideTokenMode("default");
      setOverrideTokenCustom("");
      setOverrideExpires("");
      setOverrideReason("");
    }
  };

  const handleSubmitOverride = async () => {
    if (!overrideTarget) return;
    if (!overrideReason.trim()) {
      toast({ title: "Reason is required", variant: "destructive" });
      return;
    }
    let monthlyTokenLimit: number | "unlimited" | null | undefined;
    if (overrideTokenMode === "default") {
      monthlyTokenLimit = null;
    } else if (overrideTokenMode === "unlimited") {
      monthlyTokenLimit = "unlimited";
    } else {
      const n = Number(overrideTokenCustom);
      if (!Number.isInteger(n) || n <= 0) {
        toast({ title: "Custom token limit must be a positive integer", variant: "destructive" });
        return;
      }
      monthlyTokenLimit = n;
    }

    // Date input gives us yyyy-mm-dd; treat as end-of-day UTC so the trial
    // runs through that calendar day in every timezone.
    let expiresAt: string | null = null;
    if (overrideExpires) {
      const d = new Date(`${overrideExpires}T23:59:59.999Z`);
      if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        toast({ title: "Expiry date must be in the future", variant: "destructive" });
        return;
      }
      expiresAt = d.toISOString();
    }

    try {
      setSavingOverride(true);
      await setPlanOverride(overrideTarget.id, {
        planSlug: overridePlan === "keep" ? null : overridePlan,
        monthlyTokenLimit,
        expiresAt,
        reason: overrideReason.trim(),
      });
      toast({ title: `Override applied to ${overrideTarget.name}` });
      setOverrideTarget(null);
      loadUsers();
    } catch (err) {
      toast({
        title: "Failed to apply override",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingOverride(false);
    }
  };

  const handleClearOverride = async (user: ApiUser) => {
    const original = user.planOverride?.originalPlanName ?? "their subscription plan";
    if (!window.confirm(`Reset ${user.name} back to ${original}? This removes the admin override.`)) return;
    try {
      await clearPlanOverride(user.id);
      toast({ title: `${user.name} reset to ${original}` });
      loadUsers();
    } catch {
      toast({ title: "Failed to clear override", variant: "destructive" });
    }
  };

  const handleToggleStatus = async (user: ApiUser) => {
    const isCurrentlyActive = user.isActive && !user.isSuspended;
    const newStatus = isCurrentlyActive ? "suspended" : "active";
    try {
      await apiClient.put(`/api/admin/impersonate/users/${user.id}/status`, { status: newStatus });
      toast({ title: `${user.name} ${newStatus === "suspended" ? "suspended" : "reactivated"}` });
      loadUsers();
    } catch {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };

  // ── Bulk selection helpers ─────────────────────────────────────────────────
  // Super-admins can't be bulk-targeted (the server rejects them too, but
  // we hide the checkbox to keep the UI honest about what's selectable).
  const selectableIds = users.filter(u => !u.isSuperAdmin && u.id !== currentUser?.id).map(u => u.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(selectableIds) : new Set());
  };

  const toggleOne = (userId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(userId); else next.delete(userId);
      return next;
    });
  };

  const runBulkAction = async (action: "ban" | "suspend" | "delete") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      setPendingBulk(action);
      const res = await apiClient.post<{
        succeeded: string[];
        skipped: Array<{ userId: string; reason: "not_found" | "self" | "super_admin" }>;
      }>(`/api/admin/impersonate/users/bulk/${action}`, { userIds: ids });
      const { succeeded, skipped } = res.data;
      const verb = action === "delete" ? "deleted" : action === "ban" ? "banned" : "suspended";
      toast({
        title: `${succeeded.length} user${succeeded.length === 1 ? "" : "s"} ${verb}`,
        description: skipped.length > 0
          ? `${skipped.length} skipped (super-admin / self / not found)`
          : undefined,
      });
      setSelectedIds(new Set());
      setBulkConfirm(null);
      loadUsers();
    } catch (err) {
      toast({
        title: `Failed to ${action}`,
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPendingBulk(null);
    }
  };

  const activeCount = users.filter(u => u.isActive && !u.isSuspended).length;
  const suspendedCount = users.filter(u => u.isSuspended).length;
  const adminCount = users.filter(u => u.role === "admin" || u.isSuperAdmin).length;
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
            <SelectItem value="super_admin">Super Admin</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="employer">Employer</SelectItem>
            <SelectItem value="recruiter">Recruiter</SelectItem>
            <SelectItem value="job_seeker">Job Seeker</SelectItem>
            {/* Affiliate is NOT a role — it's a service users opt into.
                Filtering for affiliates uses the separate `enableAffiliate`
                / affiliate-profile join, surfaced as its own filter. */}
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
            <SelectItem value="banned">Banned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar — appears when ≥1 user is selected. */}
      {selectedIds.size > 0 && canDelete && (
        <div className="flex items-center justify-between rounded-md border border-brand-purple/30 bg-brand-purple/5 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} user{selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pendingBulk !== null}
              onClick={() => runBulkAction("suspend")}
            >
              {pendingBulk === "suspend" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <UserX className="h-3.5 w-3.5 mr-1.5" />
              )}
              Suspend
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pendingBulk !== null}
              onClick={() => setBulkConfirm("ban")}
            >
              <Ban className="h-3.5 w-3.5 mr-1.5" />
              Ban
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={pendingBulk !== null}
              onClick={() => setBulkConfirm("delete")}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pendingBulk !== null}
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          </div>
        </div>
      )}

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
              <TableHead className="w-10">
                {canDelete && (
                  <Checkbox
                    aria-label="Select all users"
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(v) => toggleSelectAll(v === true)}
                    disabled={selectableIds.length === 0}
                  />
                )}
              </TableHead>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Tools used</TableHead>
              <TableHead>Resumes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  Loading users...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  No users match your filters.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const status = getUserStatus(user);
                const isSelectable = !user.isSuperAdmin && user.id !== currentUser?.id;
                return (
                  <TableRow key={user.id} data-state={selectedIds.has(user.id) ? "selected" : undefined}>
                    <TableCell className="w-10">
                      {canDelete && isSelectable && (
                        <Checkbox
                          aria-label={`Select ${user.name}`}
                          checked={selectedIds.has(user.id)}
                          onCheckedChange={(v) => toggleOne(user.id, v === true)}
                        />
                      )}
                    </TableCell>
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
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit items-center rounded px-2 py-0.5 text-xs font-medium ${
                            user.isUnlimited
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                              : user.isPaid
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                          }`}
                        >
                          {user.isUnlimited ? "Unlimited" : user.isPaid ? user.planName : "Free"}
                        </span>
                        {user.planOverride?.active && (
                          <span
                            className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                            title={
                              `Overridden from ${user.planOverride.originalPlanName}\n` +
                              `Reason: ${user.planOverride.reason}\n` +
                              (user.planOverride.expiresAt
                                ? `Expires ${formatTz(user.planOverride.expiresAt, { year: "numeric", month: "short", day: "numeric" })}`
                                : "Permanent override")
                            }
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            Override
                            {user.planOverride.expiresAt && (
                              <span className="opacity-80">
                                · til {formatTz(user.planOverride.expiresAt, { month: "short", day: "numeric" })}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.isUnlimited ? (
                        <div className="leading-tight">
                          <div className="font-medium">
                            {formatTokens(user.monthlyUsed)}
                            <span className="text-muted-foreground">{" / ∞"}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">unlimited</div>
                        </div>
                      ) : (
                        <div className="leading-tight">
                          <div className="font-medium">
                            {formatTokens(user.monthlyUsed)}
                            <span className="text-muted-foreground">
                              {" / "}
                              {user.monthlyLimit !== null ? formatTokens(user.monthlyLimit) : "∞"}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatTokens(user.tokensAvailable ?? 0)} available
                            {user.packBalance > 0 && ` (+${formatTokens(user.packBalance)} pack)`}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.toolRunCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setToolHistoryTarget(user)}
                          className="inline-flex items-center gap-1 text-brand-purple hover:underline font-medium"
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          {user.toolRunCount}
                          {user.toolTokensUsed > 0 && (
                            <span className="text-xs text-muted-foreground font-normal">
                              ({formatTokens(user.toolTokensUsed)} tokens)
                            </span>
                          )}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.resumeCount > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          {user.resumeCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[status]}`}>
                        {status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatTz(user.createdAt, { year: "numeric", month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.lastLoginAt ? formatTz(user.lastLoginAt, { year: "numeric", month: "short", day: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => navigate(`/people/${user.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />View Profile
                          </DropdownMenuItem>
                          {canUpdate && (
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <ShieldCheck className="h-4 w-4 mr-2" />Change Role
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {/* Affiliate is a service, not a role — removed from the
                                     role-change menu. To flip affiliate status, use the
                                     dedicated affiliate-profile admin surface. */}
                                {["job_seeker", "employer", "recruiter", "admin"]
                                  .filter((r) => r !== user.role)
                                  .map((r) => (
                                    <DropdownMenuItem key={r} onSelect={() => handleChangeRole(user, r)}>
                                      Set {getRoleDisplayLabel(r)}
                                    </DropdownMenuItem>
                                  ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          )}
                          {canImpersonate && (
                            <DropdownMenuItem onSelect={() => handleImpersonate(user)}>
                              <UserCheck className="h-4 w-4 mr-2" />Impersonate
                            </DropdownMenuItem>
                          )}
                          {canUpdate && (
                            <DropdownMenuItem onSelect={() => handleSendPasswordReset(user)}>
                              <KeyRound className="h-4 w-4 mr-2" />Send Password Reset
                            </DropdownMenuItem>
                          )}
                          {canUpdate && user.resumeCount > 0 && (
                            <DropdownMenuItem
                              onSelect={() => handleHealResumes(user)}
                              disabled={healingUserId === user.id}
                            >
                              {healingUserId === user.id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Stethoscope className="h-4 w-4 mr-2" />
                              )}
                              Heal resume data ({user.resumeCount})
                            </DropdownMenuItem>
                          )}
                          {canManageTokens && !user.isUnlimited && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => handleOpenGrant(user)}>
                                <Coins className="h-4 w-4 mr-2" />Grant Tokens
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleResetTokens(user)}>
                                <RotateCcw className="h-4 w-4 mr-2" />Reset Monthly Usage
                              </DropdownMenuItem>
                            </>
                          )}
                          {canUpdate && !user.isSuperAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => handleOpenOverride(user)}>
                                <Sparkles className="h-4 w-4 mr-2" />
                                {user.planOverride?.active ? "Edit Plan Override" : "Plan Override…"}
                              </DropdownMenuItem>
                              {user.planOverride?.active && (
                                <DropdownMenuItem onSelect={() => handleClearOverride(user)}>
                                  <Undo2 className="h-4 w-4 mr-2" />
                                  Reset to {user.planOverride.originalPlanName}
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              {user.isActive && !user.isSuspended ? (
                                <DropdownMenuItem className="text-destructive" onSelect={() => handleToggleStatus(user)}>
                                  <UserX className="h-4 w-4 mr-2" />
                                  Suspend
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => handleToggleStatus(user)}>
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  Reactivate
                                </DropdownMenuItem>
                              )}
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

      {/* Grant Tokens dialog */}
      <Dialog open={grantTarget !== null} onOpenChange={(open) => !open && setGrantTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant tokens</DialogTitle>
            <DialogDescription>
              Add tokens to {grantTarget?.name}'s purchased pack balance. These never expire and are spent after the monthly allowance is used up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="grant-tokens">Tokens</Label>
              <Input
                id="grant-tokens"
                type="number"
                min={1}
                step={1}
                placeholder="e.g. 500000"
                value={grantTokens}
                onChange={(e) => setGrantTokens(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Common amounts: 500K = 500000, 2M = 2000000, 10M = 10000000
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-reason">Reason (optional)</Label>
              <Input
                id="grant-reason"
                placeholder="e.g. Support ticket #123 — comp for outage"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantTarget(null)} disabled={granting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitGrant} disabled={granting || !grantTokens}>
              {granting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan Override dialog — SuperAdmin comp / trial / custom token limit */}
      <Dialog open={overrideTarget !== null} onOpenChange={(open) => !open && setOverrideTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Plan override</DialogTitle>
            <DialogDescription>
              {overrideTarget && (
                <>
                  <span className="font-medium">{overrideTarget.name}</span>'s original plan:{" "}
                  <span className="font-medium">
                    {overrideTarget.planOverride?.originalPlanName ?? "Free"}
                  </span>
                  . The override bypasses Stripe — use for comps, trials, or custom enterprise limits. Clear it any time to revert.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={overridePlan} onValueChange={(v) => setOverridePlan(v as OverridablePlanSlug | "keep")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Keep original plan (token-limit only)</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="unlimited">Unlimited</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Monthly token limit</Label>
              <Select value={overrideTokenMode} onValueChange={(v) => setOverrideTokenMode(v as "default" | "custom" | "unlimited")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Plan default</SelectItem>
                  <SelectItem value="custom">Custom amount</SelectItem>
                  <SelectItem value="unlimited">Unlimited</SelectItem>
                </SelectContent>
              </Select>
              {overrideTokenMode === "custom" && (
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="e.g. 3000000"
                  value={overrideTokenCustom}
                  onChange={(e) => setOverrideTokenCustom(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="override-expires">Expires on (optional)</Label>
              <Input
                id="override-expires"
                type="date"
                value={overrideExpires}
                onChange={(e) => setOverrideExpires(e.target.value)}
                min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for a permanent override. Use a date to grant a trial window; after that the user reverts to their subscription plan automatically.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="override-reason">Reason (required)</Label>
              <Input
                id="override-reason"
                placeholder="e.g. Enterprise pilot — 30-day evaluation"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideTarget(null)} disabled={savingOverride}>
              Cancel
            </Button>
            <Button onClick={handleSubmitOverride} disabled={savingOverride || !overrideReason.trim()}>
              {savingOverride && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {overrideTarget?.planOverride?.active ? "Save changes" : "Apply override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk ban / delete confirmation */}
      <Dialog open={bulkConfirm !== null} onOpenChange={(open) => !open && setBulkConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkConfirm === "delete" ? "Delete users permanently?" : "Ban users?"}
            </DialogTitle>
            <DialogDescription>
              {bulkConfirm === "delete" ? (
                <>
                  This will <span className="font-semibold text-destructive">permanently erase</span>{" "}
                  {selectedIds.size} user{selectedIds.size === 1 ? "" : "s"} and all associated data
                  (resumes, videos, tool runs, usage, audit history). Intended for spammers — no
                  recovery is possible.
                </>
              ) : (
                <>
                  Banning blocks login and hides {selectedIds.size} user
                  {selectedIds.size === 1 ? "" : "s"} from the entire product. They can be
                  unbanned later via the "Banned" status filter.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkConfirm(null)}
              disabled={pendingBulk !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkConfirm && runBulkAction(bulkConfirm)}
              disabled={pendingBulk !== null}
            >
              {pendingBulk !== null && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {bulkConfirm === "delete" ? "Delete permanently" : "Ban users"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
