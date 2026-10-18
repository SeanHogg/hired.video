import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api-client";
import { USER_PAGE_SIZE } from "./helpers";
import type { ApiUser, UserStats, UserViewMode } from "./types";

/**
 * Filters, pagination, the paged user list and the global stats for the
 * SuperAdmin user-management page.
 */
export function useUserList() {
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
  const [viewMode, setViewMode] = useState<UserViewMode>("list");
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // Global stats for the summary cards. Loaded from /users/stats so the
  // numbers reflect the whole DB, not just the visible page (which used
  // to keep "Active 50" stuck at 50 forever after a bulk ban).
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = USER_PAGE_SIZE;

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
        `/api/admin/sa/users?${params.toString()}`
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
      const res = await apiClient.get<UserStats>("/api/admin/sa/users/stats");
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
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Filter setters reset to page 1 so the new result set starts at the top.
  const changeRoleFilter = (v: string) => { setRoleFilter(v); setPage(1); };
  const changeStatusFilter = (v: string) => { setStatusFilter(v); setPage(1); };
  const toggleEditorialFilter = () => { setEditorialFilter((v) => !v); setPage(1); };
  const toggleReferredFilter = () => { setReferredFilter((v) => !v); setPage(1); };

  return {
    search,
    searchInput,
    setSearchInput,
    roleFilter,
    changeRoleFilter,
    statusFilter,
    changeStatusFilter,
    editorialFilter,
    toggleEditorialFilter,
    referredFilter,
    toggleReferredFilter,
    viewMode,
    setViewMode,
    users,
    total,
    page,
    setPage,
    limit,
    stats,
    loading,
    error,
    loadUsers,
    refresh,
  };
}
