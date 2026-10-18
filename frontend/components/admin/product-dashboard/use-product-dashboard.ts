import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { downloadApiFile } from "@/lib/services/download-service";
import { apiClient } from "@/lib/api-client";
import { AffiliateService, type AffiliateAdminStats } from "@/lib/services/affiliate-service";
import type { ProductDashboardData } from "./types";

/**
 * Data + UI state for the SuperAdmin product dashboard: platform metrics
 * (loaded on mount), affiliate stats (lazy, first time the affiliates tab
 * opens), CSV export and the two slide-out panels.
 */
export function useProductDashboard(isAdmin: boolean) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("overview");
  const [dashboardData, setDashboardData] =
    useState<ProductDashboardData | null>(null);
  const [affiliateStats, setAffiliateStats] = useState<AffiliateAdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [affiliateLoading, setAffiliateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [affiliateManagementOpen, setAffiliateManagementOpen] = useState(false);
  const [payoutProcessingOpen, setPayoutProcessingOpen] = useState(false);

  const affiliateService = new AffiliateService();

  useEffect(() => {
    if (isAdmin) {
      loadDashboardData();
    }
  }, [isAdmin]);

  // Load affiliate stats when affiliates tab is active
  useEffect(() => {
    if (isAdmin && activeTab === "affiliates" && !affiliateStats) {
      loadAffiliateStats();
    }
  }, [isAdmin, activeTab, affiliateStats]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("ProductDashboard: Starting to load dashboard data...");
      const response = await apiClient.get<ProductDashboardData>("/api/admin/metrics");
      console.log("ProductDashboard: API response received", response);

      // ApiClient returns ApiSuccessResponse<T> with structure: { success, data, timestamp }
      if (response.success && response.data) {
        console.log("ProductDashboard: Setting dashboard data", response.data);
        setDashboardData(response.data);
      } else {
        const errorMsg = t("errors.failedToLoadDashboard");
        console.error("ProductDashboard: API response not successful", response);
        setError(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t("errors.unknownErrorAdmin");
      console.error("ProductDashboard: Error loading dashboard data", {
        error: err,
        message: errorMsg,
        stack: err instanceof Error ? err.stack : undefined
      });
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const loadAffiliateStats = async () => {
    try {
      setAffiliateLoading(true);
      console.log("ProductDashboard: Loading affiliate stats...");
      const stats = await affiliateService.getAdminStats();
      console.log("ProductDashboard: Affiliate stats loaded", stats);
      setAffiliateStats(stats);
    } catch (err) {
      console.error("ProductDashboard: Error loading affiliate stats", err);
      // Don't set main error state for affiliate stats failure
    } finally {
      setAffiliateLoading(false);
    }
  };

  const exportData = async (format: "csv") => {
    try {
      await downloadApiFile(
        `/api/admin/metrics/export/${format}`,
        `product-dashboard-${new Date().toISOString().split("T")[0]}.${format}`,
      );
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  return {
    activeTab,
    setActiveTab,
    dashboardData,
    affiliateStats,
    affiliateLoading,
    loading,
    error,
    affiliateManagementOpen,
    setAffiliateManagementOpen,
    payoutProcessingOpen,
    setPayoutProcessingOpen,
    loadDashboardData,
    exportData,
  };
}
