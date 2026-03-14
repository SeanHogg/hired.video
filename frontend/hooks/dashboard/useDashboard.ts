import { useState, useEffect, useCallback } from "react";
import {
  dashboardService,
  type BaseDashboard,
  type JobSeekerDashboard,
  type EmployerDashboard,
  type DashboardResponse,
} from "@/lib/services/dashboard-service";
import { useAuth } from "@/lib/auth";
import { createRolePermissions, DASHBOARD_TYPES } from "@/lib/role-utils";

export type DashboardData =
  | BaseDashboard
  | JobSeekerDashboard
  | EmployerDashboard;

interface UseDashboardReturn {
  dashboardData: DashboardData | null;
  loading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  refreshDashboard: () => Promise<void>;
}

export function useDashboard(): UseDashboardReturn {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadDashboardData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Check if user is affiliate - they handle their own dashboard data
    const rolePermissions = createRolePermissions(user.role);
    if (rolePermissions.dashboardType === DASHBOARD_TYPES.AFFILIATE) {
      setLoading(false);
      setDashboardData({
        title: "Affiliate Dashboard",
        description: "Manage your referrals and track your earnings",
        metrics: [],
        recentActivity: [],
        onboardingTasks: [],
        onboardingCompletionPercentage: 0,
        lastUpdated: new Date()
      });
      setLastRefresh(new Date());
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use centralized role-based dashboard fetching
      const response: DashboardResponse<DashboardData> =
        await dashboardService.getDashboardForRole(user.role);

      if (response.success && response.data) {
        setDashboardData(response.data);
        setLastRefresh(new Date());
      } else {
        const errorMsg = response.error || "Failed to load dashboard data";
        setError(errorMsg);
      }
    } catch (error) {
      // Log error for debugging
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshDashboard = async () => {
    await loadDashboardData();
  };

  // Load data on component mount and user change
  useEffect(() => {
    loadDashboardData();
  }, [user, loadDashboardData]);

  // Record page view for analytics
  useEffect(() => {
    if (user) {
      dashboardService.recordActivity({
        activityType: "page_view",
        description: "Viewed dashboard",
        entityType: "page",
        priority: 1,
      });
    }
  }, [user]);

  return {
    dashboardData,
    loading,
    error,
    lastRefresh,
    refreshDashboard,
  };
}

export default useDashboard;
