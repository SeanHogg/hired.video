import React, { useState, useEffect, useCallback } from "react";
import { publicProfilePath } from "@shared/public-paths";
import { useIdSelection } from "@/hooks/use-id-selection";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Filter, MoreHorizontal, UserCheck, UserX, Eye, History, ShieldCheck, Loader2, Coins, RotateCcw, KeyRound, Wrench, Sparkles, Undo2, FileText, Stethoscope, Trash2, Ban, X, Gift, UserPlus, Users } from "lucide-react";
import { ReferralGroups } from "@/components/admin/ReferralGroups";
import { ToolHistorySheet } from "@/components/ToolHistorySheet";
import { UserHistorySheet } from "@/components/admin/UserHistorySheet";
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
import { confirmDialog } from "@/lib/dialogs";
import {
  setPlanOverride,
  clearPlanOverride,
  type OverridablePlanSlug,
} from "@/lib/services/superadmin-plan-override-service";

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-accent text-accent-foreground",
  admin:       "bg-accent text-accent-foreground",
  employer:    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  recruiter:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  job_seeker:  "bg-muted text-foreground",
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

interface ReferralInfo {
  referrerUserId: string;
  referrerName: string;
  referrerEmail: string;
  referralCode: string;
  referredAt: string;
  converted: boolean;
  convertedAt: string | null;
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
  isSystem: boolean;
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
  referral: ReferralInfo | null;
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
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // Editorial filter — restricts the list to is_system (house) authors.
  // SuperAdmin-only (the chip is hidden for non-SA), mirroring the
  // server-side gate on the underlying flag.
  const [editorialFilter, setEditorialFilter] = useState(false);
  // Referred filter — restricts the list to users who signed up via an
  // affiliate referral link. SuperAdmin-only chip.
  const [referredFilter, setReferredFilter] = useState(false);
  // View mode — "list" is the flat user table; "grouped" buckets referred
  // users under the affiliate who referred them. SuperAdmin-only.
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // Global stats for the summary cards. Loaded from /users/stats so the
  // numbers reflect the whole DB, not just the visible page (which used
  // to keep "Active 50" stuck at 50 forever after a bulk ban).
  const [stats, setStats] = useState<{
    total: number;
    active: number;
    suspended: number;
    inactive: number;
    banned: number;
    admins: number;
    referred: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user: currentUser, startImpersonation, isSuperAdmin } = useAuth();
  const { format: formatTz } = useUserTimezone();
  const { toast } = useToast();
  const { can } = useAdminPermissions();
  const navigate = useNavigate();

  // Bulk selection — ids picked via the row checkboxes. Cleared whenever
  // paginating or filtering replaces the users on screen, so a bulk action
  // never acts on rows the admin can no longer see.
  const selection = useIdSelection([page, search, roleFilter, statusFilter, editorialFilter, referredFilter]);
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
      if (editorialFilter) params.set("editorial", "true");
      if (referredFilter) params.set("referred", "true");

      const res = await apiClient.get<{ users: ApiUser[]; total: number; page: number; limit: number }>(
        `/api/admin/impersonate/users?${params.toString()}`
      );
      setUsers(res.data.users);
      setTotal(res.data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedToLoadUsers"));
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter, editorialFilter, referredFilter, t]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Stats endpoint is independent of the user list query — the summary
  // cards must reflect global counts, not the filtered/paginated subset
  // currently on screen. Refreshed alongside the user list AND after
  // every action that mutates account state (ban/suspend/delete/role/etc).
  const loadStats = useCallback(async () => {
    try {
      const res = await apiClient.get<{
        total: number;
        active: number;
        suspended: number;
        inactive: number;
        banned: number;
        admins: number;
        referred: number;
      }>("/api/admin/impersonate/users/stats");
      setStats(res.data);
    } catch {
      // Stats are a nice-to-have; failures here shouldn't block the page.
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // One-call refresh used by every mutation handler so the cards never
  // drift from the visible page. Called instead of the bare loadUsers()
  // wherever account state is touched.
  const refresh = useCallback(() => {
    loadUsers();
    loadStats();
  }, [loadUsers, loadStats]);

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleImpersonate = async (user: ApiUser) => {
    try {
      await startImpersonation(user.id, "Admin user management");
      toast({ title: t("messages.impersonatingUser", { name: user.name }) });
    } catch {
      toast({ title: t("errors.failedToImpersonate"), variant: "destructive" });
    }
  };

  const handleChangeRole = async (user: ApiUser, newRole: string) => {
    try {
      await apiClient.put(`/api/admin/impersonate/users/${user.id}/role`, { role: newRole });
      toast({ title: t("messages.changedRole", { name: user.name, role: getRoleDisplayLabel(newRole) }) });
      refresh();
    } catch {
      toast({ title: t("errors.failedToChangeRole"), variant: "destructive" });
    }
  };

  const handleSendPasswordReset = async (user: ApiUser) => {
    if (!(await confirmDialog({ title: t("dialogs.userManagement.sendPasswordResetTitle"), description: t("messages.confirmPasswordReset", { name: user.name, email: user.email }), confirmText: t("dialogs.userManagement.sendPasswordResetConfirm") }))) return;
    try {
      await apiClient.post(`/api/admin/impersonate/users/${user.id}/password-reset`, {});
      toast({ title: t("messages.passwordResetSent", { email: user.email }) });
    } catch {
      toast({ title: t("errors.failedToSendPasswordReset"), variant: "destructive" });
    }
  };

  const [healingUserId, setHealingUserId] = useState<string | null>(null);
  // userId currently displayed in the auth-history sheet, or null when closed.
  const [historyUserId, setHistoryUserId] = useState<string | null>(null);

  const handleHealResumes = async (user: ApiUser) => {
    if (user.resumeCount === 0) return;
    if (!(await confirmDialog({ title: t("dialogs.userManagement.healResumesTitle"), description: t("messages.confirmHealResumes", { count: user.resumeCount, name: user.name }), confirmText: t("dialogs.userManagement.healResumesConfirm") }))) return;
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
        title: t("messages.healCompleteFor", { name: user.name }),
        description:
          t("messages.healSummary", { healed, clean, failed, total }) +
          (failed > 0 ? t("messages.healSeeConsole") : ""),
      });
      if (failed > 0) console.warn("[admin] resume heal failures:", failures);
      refresh();
    } catch (err) {
      toast({
        title: t("errors.healFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"),
        variant: "destructive",
      });
    } finally {
      setHealingUserId(null);
    }
  };

  const handleResetTokens = async (user: ApiUser) => {
    if (!(await confirmDialog({ title: t("dialogs.userManagement.resetTokensTitle"), description: t("messages.confirmResetTokens", { name: user.name }), confirmText: t("dialogs.userManagement.resetTokensConfirm") }))) return;
    try {
      const res = await apiClient.post<{ tokensReset: number }>(
        `/api/admin/impersonate/users/${user.id}/tokens/reset`,
        {},
      );
      toast({ title: t("messages.tokensResetCount", { count: res.data.tokensReset.toLocaleString(), name: user.name }) });
      refresh();
    } catch {
      toast({ title: t("errors.failedToResetTokens"), variant: "destructive" });
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
      toast({ title: t("errors.enterPositiveInteger"), variant: "destructive" });
      return;
    }
    try {
      setGranting(true);
      await apiClient.post(
        `/api/admin/impersonate/users/${grantTarget.id}/tokens/grant`,
        { tokens, reason: grantReason || undefined },
      );
      toast({ title: t("messages.grantedTokensCount", { count: tokens.toLocaleString(), name: grantTarget.name }) });
      setGrantTarget(null);
      refresh();
    } catch {
      toast({ title: t("errors.failedToGrantTokens"), variant: "destructive" });
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
      toast({ title: t("errors.reasonRequired"), variant: "destructive" });
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
        toast({ title: t("errors.customLimitMustBePositive"), variant: "destructive" });
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
        toast({ title: t("errors.expiryMustBeFuture"), variant: "destructive" });
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
      toast({ title: t("messages.overrideApplied", { name: overrideTarget.name }) });
      setOverrideTarget(null);
      refresh();
    } catch (err) {
      toast({
        title: t("errors.failedToApplyOverride"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingOverride(false);
    }
  };

  const handleClearOverride = async (user: ApiUser) => {
    const original = user.planOverride?.originalPlanName ?? "their subscription plan";
    if (!(await confirmDialog({ title: t("dialogs.userManagement.clearOverrideTitle"), description: t("messages.confirmClearOverride", { name: user.name, plan: original }), confirmText: t("dialogs.userManagement.clearOverrideConfirm") }))) return;
    try {
      await clearPlanOverride(user.id);
      toast({ title: t("messages.userResetTo", { name: user.name, plan: original }) });
      refresh();
    } catch {
      toast({ title: t("errors.failedToClearOverride"), variant: "destructive" });
    }
  };

  const handleToggleStatus = async (user: ApiUser) => {
    const isCurrentlyActive = user.isActive && !user.isSuspended;
    const newStatus = isCurrentlyActive ? "suspended" : "active";
    try {
      await apiClient.put(`/api/admin/impersonate/users/${user.id}/status`, { status: newStatus });
      toast({ title: newStatus === "suspended" ? t("messages.userSuspended", { name: user.name }) : t("messages.userReactivated", { name: user.name }) });
      refresh();
    } catch {
      toast({ title: t("errors.failedToUpdateStatusUser"), variant: "destructive" });
    }
  };

  // Toggle the editorial / house-author flag (is_system). SuperAdmin-only —
  // the menu item is hidden for non-SA, and the server re-checks via the
  // superAdminMiddleware on /admin/impersonate.
  const handleToggleSystem = async (user: ApiUser) => {
    const next = !user.isSystem;
    try {
      await apiClient.put(`/api/admin/impersonate/users/${user.id}/system`, { isSystem: next });
      toast({
        title: next
          ? t("messages.userMarkedEditorial", { name: user.name })
          : t("messages.userUnmarkedEditorial", { name: user.name }),
      });
      refresh();
    } catch {
      toast({ title: t("errors.failedToUpdateEditorial"), variant: "destructive" });
    }
  };

  // ── Bulk selection helpers ─────────────────────────────────────────────────
  // Super-admins can't be bulk-targeted (the server rejects them too, but
  // we hide the checkbox to keep the UI honest about what's selectable).
  const selectableIds = users.filter(u => !u.isSuperAdmin && u.id !== currentUser?.id).map(u => u.id);

  const runBulkAction = async (action: "ban" | "suspend" | "delete") => {
    const ids = selection.ids;
    if (ids.length === 0) return;
    try {
      setPendingBulk(action);
      const res = await apiClient.post<{
        succeeded: string[];
        skipped: Array<{ userId: string; reason: "not_found" | "self" | "super_admin" }>;
      }>(`/api/admin/impersonate/users/bulk/${action}`, { userIds: ids });
      const { succeeded, skipped } = res.data;
      const verb = action === "delete" ? t("admin.bulkVerbs.deleted") : action === "ban" ? t("admin.bulkVerbs.banned") : t("admin.bulkVerbs.suspended");
      toast({
        title: t("messages.bulkSuccess", { count: succeeded.length, verb }),
        description: skipped.length > 0
          ? t("messages.bulkSkippedSuffix", { count: skipped.length })
          : undefined,
      });
      selection.clear();
      setBulkConfirm(null);
      refresh();
    } catch (err) {
      toast({
        title: t("errors.failedBulkAction", { action: action === "delete" ? t("admin.actions.bulkDelete") : action === "ban" ? t("admin.actions.bulkBan") : t("admin.actions.bulkSuspend") }),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPendingBulk(null);
    }
  };

  // Cards prefer the global stats endpoint when available so they
  // reflect the whole DB, not the visible page. Fall back to
  // page-derived counts during the first paint / on stats failure so
  // the cards aren't empty.
  const activeCount = stats?.active ?? users.filter(u => u.isActive && !u.isSuspended).length;
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: t("status.activeStatus"),    count: activeCount,    color: "text-green-600" },
          { label: t("status.suspendedStatus"), count: suspendedCount, color: "text-red-600"   },
          { label: t("status.inactiveStatus"),  count: inactiveCount,  color: "text-yellow-600"},
          { label: t("labels.admin") + "s",     count: adminCount,     color: "text-primary" },
          { label: t("labels.referred"),        count: referredCount,  color: "text-brand-primary" },
        ].map(({ label, count, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* View toggle — flat user list vs. referred-users-grouped-by-referrer.
          SuperAdmin-only; the grouped view is backed by the SA-gated
          /users/referrals endpoint. */}
      {isSuperAdmin && (
        <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
          <Button
            type="button"
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            className="h-8"
            aria-pressed={viewMode === "list"}
            onClick={() => setViewMode("list")}
          >
            <Users className="h-3.5 w-3.5 mr-1.5" />
            {t("labels.allUsers")}
          </Button>
          <Button
            type="button"
            variant={viewMode === "grouped" ? "default" : "ghost"}
            size="sm"
            className="h-8"
            aria-pressed={viewMode === "grouped"}
            onClick={() => setViewMode("grouped")}
          >
            <Gift className="h-3.5 w-3.5 mr-1.5" />
            {t("labels.groupByReferrer")}
          </Button>
        </div>
      )}

      {viewMode === "grouped" && <ReferralGroups />}

      {/* Filters — sticky on sm+ so they remain visible when the user
          scrolls the table. top-16 sits flush under the fixed top
          Navigation. The bg + ring pulls the row over the table beneath
          so rows don't bleed through under the controls. Pinned height
          is filter-input (40px) + py-3 ×2 (24px) = 64px → so the table
          header below uses top-32 (128px = 64 nav + 64 filters). */}
      {viewMode === "list" && (
      <div className="sm:sticky sm:top-16 z-30 bg-background sm:py-3 sm:-my-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("messages.searchByNameOrEmail")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder={t("labels.role")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("labels.allRoles")}</SelectItem>
              <SelectItem value="super_admin">{t("labels.superAdmin")}</SelectItem>
              <SelectItem value="admin">{t("labels.admin")}</SelectItem>
              <SelectItem value="employer">{getRoleDisplayLabel("employer")}</SelectItem>
              <SelectItem value="recruiter">{getRoleDisplayLabel("recruiter")}</SelectItem>
              <SelectItem value="job_seeker">{getRoleDisplayLabel("job_seeker")}</SelectItem>
              {/* Affiliate is NOT a role — it's a service users opt into.
                  Filtering for affiliates uses the separate `enableAffiliate`
                  / affiliate-profile join, surfaced as its own filter. */}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t("labels.callStatus")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("labels.allStatuses")}</SelectItem>
              <SelectItem value="active">{t("status.activeStatus")}</SelectItem>
              <SelectItem value="suspended">{t("status.suspendedStatus")}</SelectItem>
              <SelectItem value="banned">{t("status.bannedStatus")}</SelectItem>
            </SelectContent>
          </Select>
          {/* Editorial filter chip — SuperAdmin-only. Toggles the
              is_system (house author) restriction on the list. */}
          {isSuperAdmin && (
            <Button
              type="button"
              variant={editorialFilter ? "default" : "outline"}
              size="sm"
              className="h-10 whitespace-nowrap"
              aria-pressed={editorialFilter}
              onClick={() => { setEditorialFilter((v) => !v); setPage(1); }}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {t("labels.editorial")}
            </Button>
          )}
          {/* Referred filter chip — SuperAdmin-only. Restricts the list to
              users who signed up via an affiliate referral link. */}
          {isSuperAdmin && (
            <Button
              type="button"
              variant={referredFilter ? "default" : "outline"}
              size="sm"
              className="h-10 whitespace-nowrap"
              aria-pressed={referredFilter}
              onClick={() => { setReferredFilter((v) => !v); setPage(1); }}
            >
              <Gift className="h-3.5 w-3.5 mr-1.5" />
              {t("labels.referred")}
            </Button>
          )}
        </div>
      </div>
      )}

      {/* Bulk action bar — appears when ≥1 user is selected. */}
      {selection.size > 0 && canDelete && (
        <div className="flex items-center justify-between rounded-md border border-brand-primary/30 bg-brand-primary/5 px-4 py-2">
          <span className="text-sm font-medium">
            {t("labels.selectedUsersCount", { count: selection.size })}
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
              {t("actions.suspend")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pendingBulk !== null}
              onClick={() => setBulkConfirm("ban")}
            >
              <Ban className="h-3.5 w-3.5 mr-1.5" />
              {t("actions.ban")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={pendingBulk !== null}
              onClick={() => setBulkConfirm("delete")}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {t("actions.deleteAdmin")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pendingBulk !== null}
              onClick={() => selection.clear()}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              {t("actions.clear")}
            </Button>
          </div>
        </div>
      )}

      {/* Error */}
      {viewMode === "list" && error && (
        <div className="text-center text-destructive py-4">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={loadUsers}>{t("actions.retry")}</Button>
        </div>
      )}

      {/* Table — wrapperClassName="overflow-visible" disables the
          shared Table's overflow-auto wrapper so position:sticky on
          <thead> applies against the page scroll (otherwise the
          wrapper becomes the sticky containing block and the header
          stays put when only the wrapper scrolls — i.e. never on
          desktop). The horizontal scroll for narrow viewports is
          accepted as a tradeoff; admin users on mobile are rare and
          can scroll the page itself. */}
      {viewMode === "list" && (
      <Card>
        <Table wrapperClassName="overflow-visible">
          {/* top-32 = 8rem = 128px = 64 (fixed Navigation) + 64
              (sticky filter container above). z-20 sits below the
              filters' z-30 so the dropdown menus open above the
              table header cleanly. bg-background prevents row
              content bleeding through under the sticky row. The
              shadow-sm on the bottom edge gives the header a clear
              visual anchor when it's pinned. */}
          <TableHeader className="sticky top-32 z-20 bg-background shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="w-10">
                {canDelete && (
                  <Checkbox
                    aria-label="Select all users"
                    checked={selection.headerState(selectableIds)}
                    onCheckedChange={(v) => selection.setMany(selectableIds, v === true)}
                    disabled={selectableIds.length === 0}
                  />
                )}
              </TableHead>
              <TableHead>{t("labels.userFallback")}</TableHead>
              <TableHead>{t("labels.role")}</TableHead>
              <TableHead>{t("labels.plan")}</TableHead>
              <TableHead>{t("labels.tokens")}</TableHead>
              <TableHead>{t("labels.toolsUsed")}</TableHead>
              <TableHead>{t("labels.resumes")}</TableHead>
              <TableHead>{t("labels.callStatus")}</TableHead>
              <TableHead>{t("labels.joined")}</TableHead>
              <TableHead>{t("labels.lastLogin")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  {t("status.loadingUsers")}
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  {t("messages.noUsersMatch")}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const status = getUserStatus(user);
                const isSelectable = !user.isSuperAdmin && user.id !== currentUser?.id;
                return (
                  <TableRow key={user.id} data-state={selection.isSelected(user.id) ? "selected" : undefined}>
                    <TableCell className="w-10">
                      {canDelete && isSelectable && (
                        <Checkbox
                          aria-label={`Select ${user.name}`}
                          checked={selection.isSelected(user.id)}
                          onCheckedChange={(v) => selection.toggle(user.id, v === true)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                        {/* Referral indicator — shown when this user signed up
                            via an affiliate link. Tooltip carries the referrer
                            + conversion status; the badge is the at-a-glance
                            "this was a referral" cue. */}
                        {user.referral && (
                          <span
                            className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200"
                            title={
                              t("messages.referredByTooltip", {
                                name: user.referral.referrerName || user.referral.referrerEmail,
                                code: user.referral.referralCode,
                              }) +
                              (user.referral.converted ? `\n${t("labels.converted")}` : "")
                            }
                          >
                            <Gift className="h-2.5 w-2.5" />
                            {t("labels.referredBy", { name: user.referral.referrerName || user.referral.referrerEmail })}
                            {user.referral.converted && <UserPlus className="h-2.5 w-2.5 opacity-80" />}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] ?? ""}`}>
                          {user.isSuperAdmin ? t("labels.superAdmin") : getRoleDisplayLabel(user.role)}
                        </span>
                        {user.isSystem && (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-accent text-accent-foreground">
                            <Sparkles className="h-2.5 w-2.5" />
                            {t("labels.editorial")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit items-center rounded px-2 py-0.5 text-xs font-medium ${
                            user.isUnlimited
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              : user.isPaid
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                          }`}
                        >
                          {user.isUnlimited ? t("marketing.pricing.value.unlimited") : user.isPaid ? user.planName : t("tiers.free.name")}
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
                            {t("prompts.dialogPlanOverride")}
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
                          <div className="text-xs text-muted-foreground">{t("labels.unlimitedLowercase")}</div>
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
                            {t("labels.tokensAvailable", { count: formatTokens(user.tokensAvailable ?? 0) })}
                            {user.packBalance > 0 && ` ${t("labels.packSuffix", { count: formatTokens(user.packBalance) })}`}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.toolRunCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setToolHistoryTarget(user)}
                          className="inline-flex items-center gap-1 text-brand-primary hover:underline font-medium"
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
                          <DropdownMenuItem onSelect={() => navigate(publicProfilePath(user.id))}>
                            <Eye className="h-4 w-4 mr-2" />{t("actions.viewProfile")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setHistoryUserId(user.id)}>
                            <History className="h-4 w-4 mr-2" />{t("actions.viewHistory")}
                          </DropdownMenuItem>
                          {canUpdate && (
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <ShieldCheck className="h-4 w-4 mr-2" />{t("actions.changeRole")}
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {/* Affiliate is a service, not a role — removed from the
                                     role-change menu. To flip affiliate status, use the
                                     dedicated affiliate-profile admin surface. */}
                                {["job_seeker", "employer", "recruiter", "admin"]
                                  .filter((r) => r !== user.role)
                                  .map((r) => (
                                    <DropdownMenuItem key={r} onSelect={() => handleChangeRole(user, r)}>
                                      {t("actions.setRole", { role: getRoleDisplayLabel(r) })}
                                    </DropdownMenuItem>
                                  ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          )}
                          {canImpersonate && (
                            <DropdownMenuItem onSelect={() => handleImpersonate(user)}>
                              <UserCheck className="h-4 w-4 mr-2" />{t("actions.impersonate")}
                            </DropdownMenuItem>
                          )}
                          {canUpdate && (
                            <DropdownMenuItem onSelect={() => handleSendPasswordReset(user)}>
                              <KeyRound className="h-4 w-4 mr-2" />{t("actions.sendPasswordReset")}
                            </DropdownMenuItem>
                          )}
                          {/* Editorial / house-author flag — SuperAdmin-only. */}
                          {isSuperAdmin && (
                            <DropdownMenuItem onSelect={() => handleToggleSystem(user)}>
                              <Sparkles className="h-4 w-4 mr-2" />
                              {user.isSystem ? t("actions.unmarkEditorial") : t("actions.markEditorial")}
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
                              {t("actions.healResumeData", { count: user.resumeCount })}
                            </DropdownMenuItem>
                          )}
                          {canManageTokens && !user.isUnlimited && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => handleOpenGrant(user)}>
                                <Coins className="h-4 w-4 mr-2" />{t("actions.grantTokens")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleResetTokens(user)}>
                                <RotateCcw className="h-4 w-4 mr-2" />{t("actions.resetMonthlyUsage")}
                              </DropdownMenuItem>
                            </>
                          )}
                          {canUpdate && !user.isSuperAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => handleOpenOverride(user)}>
                                <Sparkles className="h-4 w-4 mr-2" />
                                {user.planOverride?.active ? t("actions.editPlanOverride") : t("actions.planOverride")}
                              </DropdownMenuItem>
                              {user.planOverride?.active && (
                                <DropdownMenuItem onSelect={() => handleClearOverride(user)}>
                                  <Undo2 className="h-4 w-4 mr-2" />
                                  {t("actions.resetToPlan", { plan: user.planOverride.originalPlanName })}
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
                                  {t("actions.suspend")}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => handleToggleStatus(user)}>
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  {t("actions.reactivate")}
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
      )}

      {/* Grant Tokens dialog */}
      <Dialog open={grantTarget !== null} onOpenChange={(open) => !open && setGrantTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("prompts.dialogGrantTokens")}</DialogTitle>
            <DialogDescription>
              {t("messages.grantTokensDesc", { name: grantTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="grant-tokens">{t("labels.tokens")}</Label>
              <Input
                id="grant-tokens"
                type="number"
                min={1}
                step={1}
                placeholder={t("prompts.tokenAmountPlaceholder")}
                value={grantTokens}
                onChange={(e) => setGrantTokens(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("messages.grantTokensHint")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-reason">{t("prompts.reasonOptional")}</Label>
              <Input
                id="grant-reason"
                placeholder={t("prompts.grantReasonPlaceholder")}
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantTarget(null)} disabled={granting}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleSubmitGrant} disabled={granting || !grantTokens}>
              {granting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("actions.grant")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan Override dialog — SuperAdmin comp / trial / custom token limit */}
      <Dialog open={overrideTarget !== null} onOpenChange={(open) => !open && setOverrideTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("prompts.dialogPlanOverride")}</DialogTitle>
            <DialogDescription>
              {overrideTarget && (
                <>{t("messages.overrideDialogIntro", { name: overrideTarget.name, plan: overrideTarget.planOverride?.originalPlanName ?? t("tiers.free.name") })}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("labels.plan")}</Label>
              <Select value={overridePlan} onValueChange={(v) => setOverridePlan(v as OverridablePlanSlug | "keep")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">{t("prompts.planSelectKeep")}</SelectItem>
                  <SelectItem value="free">{t("tiers.free.name")}</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="unlimited">{t("marketing.pricing.value.unlimited")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("prompts.monthlyTokenLimit")}</Label>
              <Select value={overrideTokenMode} onValueChange={(v) => setOverrideTokenMode(v as "default" | "custom" | "unlimited")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t("prompts.tokenModeDefault")}</SelectItem>
                  <SelectItem value="custom">{t("prompts.tokenModeCustom")}</SelectItem>
                  <SelectItem value="unlimited">{t("marketing.pricing.value.unlimited")}</SelectItem>
                </SelectContent>
              </Select>
              {overrideTokenMode === "custom" && (
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder={t("prompts.tokenCustomPlaceholder")}
                  value={overrideTokenCustom}
                  onChange={(e) => setOverrideTokenCustom(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="override-expires">{t("prompts.expiresOnOptional")}</Label>
              <Input
                id="override-expires"
                type="date"
                value={overrideExpires}
                onChange={(e) => setOverrideExpires(e.target.value)}
                min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
              />
              <p className="text-xs text-muted-foreground">
                {t("messages.overrideExpiresHint")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="override-reason">{t("prompts.reasonRequired")}</Label>
              <Input
                id="override-reason"
                placeholder={t("prompts.overrideReasonPlaceholder")}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideTarget(null)} disabled={savingOverride}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleSubmitOverride} disabled={savingOverride || !overrideReason.trim()}>
              {savingOverride && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {overrideTarget?.planOverride?.active ? t("actions.saveChanges") : t("actions.applyOverride")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk ban / delete confirmation */}
      <Dialog open={bulkConfirm !== null} onOpenChange={(open) => !open && setBulkConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkConfirm === "delete" ? t("messages.confirmDeleteUsersTitle") : t("messages.confirmBanUsersTitle")}
            </DialogTitle>
            <DialogDescription>
              {bulkConfirm === "delete"
                ? t("messages.confirmDeleteUsersBody", { count: selection.size })
                : t("messages.confirmBanUsersBody", { count: selection.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkConfirm(null)}
              disabled={pendingBulk !== null}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkConfirm && runBulkAction(bulkConfirm)}
              disabled={pendingBulk !== null}
            >
              {pendingBulk !== null && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {bulkConfirm === "delete" ? t("actions.deletePermanently") : t("actions.banUsers")}
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
